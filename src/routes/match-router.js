import express from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma/index.js";
import authMiddleware from "../middlewares/auth-middleware.js";
import champVerification from "../middlewares/agent-verify-middleware.js";

/* 계정 라우터 생성 */
const router = express.Router();

/* 스쿼드 종합 점수 계산 함수 */
const checkSquadScore = async (user) => {
  let squadScore = 0;
  // [1] 스쿼드 구성 멤버 확인
  const { squadMem1, squadMem2, squadMem3, synergy } = user;
  const checkSquad = [squadMem1, squadMem2, squadMem3];

  // [2] 구성 멤버 스탯에 강화 및 돌파 수치 적용
  for (const memKey of checkSquad) {
    // [2-1] 구성 멤버 스탯 수령
    // [2-2] 강화 수치와 돌파 수치와 포지션 확인
    const agents = await prisma.agents.findFirst({
      where: { agentKey: memKey },
      select: {
        position: true,
        stat: {
          select: {
            ad: true,
            ap: true,
            hp: true,
            mp: true,
            def: true,
            crit: true,
          },
        },
        myAgent: {
          where: { userKey: user.userKey },
          select: {
            level: true,
            class: true,
          },
        },
      },
    });
    // [2-3] 돌파 수치에 맞게 특화 능력치 강화
    if (agents.position === "warrior") {
      agents.stat["ad"] *= 1 + agents.myAgent[0].class * 0.1;
      agents.stat["crit"] *= 1 + agents.myAgent[0].class * 0.1;
    } else if (agents.position === "tanker") {
      agents.stat["hp"] *= 1 + agents.myAgent[0].class * 0.1;
      agents.stat["def"] *= 1 + agents.myAgent[0].class * 0.1;
    } else {
      agents.stat["ap"] *= 1 + agents.myAgent[0].class * 0.1;
      agents.stat["mp"] *= 1 + agents.myAgent[0].class * 0.1;
    }

    // [2-4] 강화 수치에 맞게 능력치 전반 강화 후 공격대 종합 스탯에 누적
    squadScore += Object.values(agents.stat).reduce(
      (acc, cur) => (acc += cur * (1 + agents.myAgent[0].level * 0.02)),
      0
    );
  }
  // [3] 팀 시너지 적용 여부 판단
  synergy !== "none" ? (squadScore *= 1.1) : squadScore;
  // [4] 소수점 날린 팀 스코어 반환
  return Math.trunc(squadScore);
};

/* 친선전 API */
router.post("/users/select-match", authMiddleware, async (req, res, next) => {
  // 인증 미들웨어 거쳐서도 내 키 받음
  const { counterpart } = req.body; // body에서 상대방 아이디 수령
  // [검사 authMW] : 로그아웃 상태면 거부
  // [검사 authMW] : 로그인 정보와 아이디 불일치 시 거부

  // [검사 01] : 팀편성 안 됐을 시 거부
  const { squadMem1, squadMem2, squadMem3 } = req.user;
  if (!(squadMem1 && squadMem2 && squadMem3)) return res.status(401).json({ message: "팀편성부터 하세요라!!" });

  // [검사 02] : 상대 유저 정보가 존재하지 않을 시 거부
  const counterUser = await prisma.users.findFirst({ where: { nickname: counterpart } });
  if (!counterUser) return res.status(404).json({ message: "존재하지 않는 유저임다!!" });

  // [검사 03] : 상대 유저가 팀 편성이 되지 않은 경우 거부
  if (!(counterUser.squadMem1 && counterUser.squadMem2 && counterUser.squadMem3))
    return res.status(401).json({ message: "팀이 없는 유저에요!!" });

  // [1] 각 팀 스코어 체크
  const myScore = await checkSquadScore(req.user);
  const counterScore = await checkSquadScore(counterUser);

  // [2] 스코어 비교해 경기 결과 계산
  let matchResult = "";
  const score = Math.round(Math.random() * 100);
  const win = Math.round((myScore / (myScore + counterScore)) * 100);

  if (score < win) {
    matchResult = "승리!!";
  } else if (score > win) {
    matchResult = "패배!!";
  } else {
    matchResult = "무승부!!";
  }

  // [3] 각 팀의 스코어와 경기 결과 응답
  return res
    .status(201)
    .json({ message: `나의 팀 점수 ${myScore}점, 상대 팀 점수 ${counterScore}점이지만.. ${matchResult}` });
});

/* 정규전 API */
router.post("/users/rank-match", authMiddleware, async (req, res, next) => {
  const { user } = req;
  // 인증 미들웨어 거쳐서도 내 키 받음
  // [검사 authMW] : 로그아웃 상태면 거부
  // [검사 authMW] : 로그인 정보와 아이디 불일치 시 거부
  // [검사 01] : 팀편성 안 됐을 시 거부
  const { squadMem1, squadMem2, squadMem3 } = user;
  if (!(squadMem1 && squadMem2 && squadMem3)) return res.status(401).json({ message: "팀편성부터 하세요라!!" });

  // [1] 매치 메이킹
  // [1-1] 내 계정 mmr 찾기
  const { mmr: myMatchRank } = await prisma.ranks.findFirst({
    where: { userKey: user.userKey },
    select: { mmr: true },
  });
  // [1-2] 내 mmr 그룹 찾기
  const matchRanks = await prisma.ranks.findMany({
    where: {
      mmr: { gte: myMatchRank - 1000, lte: myMatchRank + 1000 },
    },
    select: {
      mmr: true,
      user: true,
    },
  });
  // [1-3] mmr 그룹에서 본인과 팀편성 미비 유저 제외하고 다시 그루핑? 하츄핑?
  // [1-3-1] 팀편성이 돼있고, 내 계정이 아닌 경우만 살려줌
  const myRankGroup = matchRanks.filter(
    (e) => e.user.squadMem1 && e.user.squadMem2 && e.user.squadMem3 && e.user.userKey !== user.userKey
  );

  if (!myRankGroup) return res.status(404).json({ errorMessage: "적절한 상대를 찾을 수 없습니다" });

  // [1-4] 그룹 중 한 명 랜덤으로 선정!!
  const counterUser = myRankGroup[Math.trunc(Math.random() * myRankGroup.length)].user;

  // [2] 스코어 비교해 경기 결과 계산
  const myScore = await checkSquadScore(req.user);
  const counterScore = await checkSquadScore(counterUser);

  // [3] 승, 패, 무 분기 별로 보상 및 점수 변동 적용
  let matchResult = "";
  const score = Math.round(Math.random() * 100);
  const win = Math.round((myScore / (myScore + counterScore)) * 100);

  if (score < win) {
    await updateData(user.userKey, counterUser.userKey);
    matchResult = "승리!!";
  } else if (score > win) {
    await updateData(counterUser.userKey, user.userKey);
    matchResult = "패배!!";
  } else {
    // [3] 비겼을 때
    // [3-1] Ranks 테이블에서, 둘다 drawCount 1 증가하고 mmr 5 증가
    // [3-2] Assets 테이블에서, 둘다 enhancer 5 증가하고 cash 30,000 증가
    await prisma.$transaction(
      async (tx) => {
        await tx.ranks.updateMany({
          where: {
            userKey: { in: [user.userKey, counterUser.userKey] },
          },
          data: {
            drawCount: { increment: 1 },
            mmr: { increment: 5 },
          },
        });
        await tx.assets.updateMany({
          where: {
            userKey: { in: [user.userKey, counterUser.userKey] },
          },
          data: {
            enhancer: { increment: 5 },
            cash: { increment: 30000 },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );
    matchResult = "무승부!!";
  }

  // 승패 유무에 따른 보상 업데이트 함수
  async function updateData(win, lose) {
    // [1] 승, 패, 무 분기별로 트랜잭션 ON
    // [2] 승패가 갈렸을 때
    await prisma.$transaction(
      async (tx) => {
        // [2-1] 승자 Ranks 테이블에서, 승자 winCount 1 증가하고 mmr 50 증가
        // [2-2] 승자 Assets 테이블에서, 승자 enhancer 10 증가하고 cash 50,000 증가
        await tx.users.update({
          where: { userKey: win },
          data: {
            rank: {
              update: {
                data: {
                  winCount: { increment: 1 },
                  mmr: { increment: 50 },
                },
              },
            },
            asset: {
              update: {
                data: {
                  enhancer: { increment: 10 },
                  cash: { increment: 50000 },
                },
              },
            },
          },
        });
        // [2-3] 패자 Ranks 테이블에서, 패자 loseCount 1 증가하고 mmr 20 감소
        // [2-4] 패자 Assets 테이블에서, 패자 enhancer 2 증가하고 cash 10,000 증가
        await tx.users.update({
          where: { userKey: lose },
          data: {
            rank: {
              update: {
                data: {
                  loseCount: { increment: 1 },
                  mmr: { decrement: 20 },
                },
              },
            },
            asset: {
              update: {
                data: {
                  enhancer: { increment: 2 },
                  cash: { increment: 10000 },
                },
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );

    return;
  }

  // [4] 각 팀의 스코어와 경기 결과 응답
  return res
    .status(201)
    .json({ message: `나의 팀 점수 ${myScore}점, 상대 팀 점수 ${counterScore}점이지만.. ${matchResult}` });
});

// 랭킹 조회 api
router.get("/users/ranks", async (req, res, next) => {
  //출력용 json
  let resJson = [];
  const ranking = await prisma.ranks.findMany({
    orderBy: [{ mmr: "desc" }, { loseCount: "asc" }],
    select: {
      userKey: true,
      winCount: true,
      loseCount: true,
      drawCount: true,
      mmr: true,
      user: true,
    },
    take: 10,
  });

  const agents = await prisma.agents.findMany({
    select: {
      agentKey: true,
      name: true,
    },
  });

  for (let i = 0; i < ranking.length; i++) {
    // 대표 캐릭터 이름 출력값 설정
    const agent = agents.find((e) => e.agentKey === ranking[i].user.favoriteAgent) || { name: "미설정" };
    // 승률 계산
    const winningRate =
      Math.round((ranking[i].winCount / (ranking[i].winCount + ranking[i].loseCount + ranking[i].drawCount)) * 100) ||
      0;
    // 전개구문 활용해 응답할 랭킹 배열 만들기
    resJson = [
      ...resJson,
      {
        rank: i + 1,
        nickname: ranking[i].user.nickname,
        favoriteAgent: agent.name,
        rankScore: ranking[i].mmr,
        winningRate: `${winningRate}%`,
        matchRecord: `${ranking[i].winCount} / ${ranking[i].loseCount} / ${ranking[i].drawCount} `,
      },
    ];
  }

  return res.status(200).json(resJson);
});

// 팀편성 API
router.put("/users/formation", authMiddleware, champVerification, async (req, res, next) => {
  const { formation } = req.body;
  const { user, agent } = req;
  // 유효성 평가 미들웨어로 챔피언 배열 받아옴
  let myAgent = [];
  let tank = false;

  for (let i = 0; i < formation.length; i++) {
    myAgent[i] = await prisma.myAgents.findFirst({ where: { agentKey: +formation[i], userKey: user.userKey } });
    //보유 챔피언 확인
    if (!myAgent[i])
      return res
        .status(400)
        .json({ errorMessage: `${agent[i].name}/${formation[i]}(은)는 현재 보유한 챔피언이 아닙니다.` });
    if (agent[i].position === "tanker") {
      tank = true;
    }
    if (myAgent.map((e) => e.agentKey).indexOf(myAgent[i].agentKey) !== i)
      return res.status(400).json({ errorMessage: "동일 챔피언은 동시에 배치할 수 없습니다." });
  }
  // 탱커 여부 확인
  if (!tank) return res.status(400).json({ errorMessage: "팀편성에는 탱커가 1명 이상 필요합니다" });

  if (myAgent.length !== 3) return res.status(400).json({ errorMessage: "팀편성에는 3명의 챔피언이 필요합니다" });

  //시너지 확인
  const synergy =
    [
      ...new Set(
        agent
          .map((e) => e.team)
          .filter((e, idx, arr) => {
            if (idx !== arr.indexOf(e)) return true;
            else return false;
          })
      ),
    ].join("") || "none";

  // 저장
  const updateUser = await prisma.users.update({
    where: { userKey: user.userKey },
    data: {
      squadMem1: +myAgent[0].agentKey,
      squadMem2: +myAgent[1].agentKey,
      squadMem3: +myAgent[2].agentKey,
      synergy,
    },
  });

  // 반환
  return res.status(201).json({
    message: "성공적으로 팀이 편성되었습니다.",
    squad: [
      `${myAgent[0].name}(${agent[0].position})`,
      `${myAgent[1].name}(${agent[1].position})`,
      `${myAgent[2].name}(${agent[2].position})`,
    ],
    synergy,
  });
});

//대표 챔피언 설정 API
router.patch("/users/favorite", authMiddleware, champVerification, async (req, res, next) => {
  const { agent, user } = req;

  const myAgent = await prisma.myAgents.findFirst({ where: { agentKey: +agent.agentKey, userKey: user.userKey } });
  // 보유 챔피언 확인
  if (!myAgent)
    return res
      .status(400)
      .json({ errorMessage: `${agent.name}/${agent.agentKey}(은)는 현재 보유한 챔피언이 아닙니다.` });

  // 저장
  const updateUser = await prisma.users.update({
    where: { userKey: user.userKey },
    data: {
      favoriteAgent: +myAgent.agentKey,
    },
  });

  // 반환
  return res.status(201).json({
    message: "대표 챔피언이 변경되었습니다.",
    favorite: myAgent.name,
  });
});

/* 라우터 내보내기 */
export default router;
