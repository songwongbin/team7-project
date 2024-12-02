import express from "express";
import { prisma } from "../utils/prisma/index.js";
import { Prisma } from "@prisma/client";

const router = express.Router();

router.get("/agents", async (req, res, next) => {
  const { option } = req.body;
  const [showHow, showWhat, orderBy, orderHow] = option.split(",");

  const validOrderBy = ["name", "position", "grade", "team"]; // 허용할 수 있는 orderBy 값들
  const validOrderHow = ["asc", "desc"]; // 허용할 수 있는 정렬 방향

  // showHow가 team, position, grade 중 하나인지 체크
  const validShowHow = ["team", "position", "grade"];
  if (!validShowHow.includes(showHow)) {
    return res.status(400).json({ error: "유효하지 않은 showHow 값입니다." });
  }

  // showWhat 유효성 검사
  if (!showWhat) {
    return res.status(400).json({ error: "showWhat 값이 필요합니다." });
  }

  // orderBy 유효성 검사
  if (!validOrderBy.includes(orderBy)) {
    return res.status(400).json({
      error: `유효하지 않은 orderBy 값입니다. 가능한 값: ${validOrderBy.join(", ")}`,
    });
  }

  // orderHow 유효성 검사
  if (!validOrderHow.includes(orderHow)) {
    return res.status(400).json({
      error: `유효하지 않은 orderHow 값입니다. 가능한 값: ${validOrderHow.join(", ")}`,
    });
  }

  // 기본 쿼리 설정
  const whereCondition = {
    [showHow]: showWhat, // showHow에 맞는 조건 설정 (team, position, grade)
  };

  const orderByCondition = validOrderBy.includes(orderBy)
    ? { [orderBy]: validOrderHow.includes(orderHow) ? orderHow : "asc" }
    : { name: "asc" }; // 기본값은 이름순 정렬

  try {
    // 동적 쿼리 실행
    const showAgents = await prisma.agents.findMany({
      where: whereCondition,
      select: {
        name: true,
        team: true,
        position: true,
        grade: true,
      },
      orderBy: [orderByCondition], // 동적으로 생성된 orderBy 조건 사용
    });

    return res.status(200).json({ data: showAgents });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "서버 오류" });
  }
});

router.get("/users/agents", async (req, res, next) => {
  const { user_key } = req.user; //미들웨어에서 받기.
  //const { user_key } = req.params;
  //미들웨어 넣기.

  const showMyAgents = await prisma.myAgents.findMany({
    where: { user_key: user_key },
    select: {
      name: true,
      team: true,
      position: true,
      grade: true,
    },
  });

  return res.status(200).json({ data: showMyAgents });
});

router.put("/gacha", async (req, res, next) => {
  const { numberOfGacha, agentKey } = req.body;
  const { user_key } = req.user;

  try {
    const userAssets = await prisma.assets.findUnique({
      where: { userKey: user_key },
    });

    const totalCost = numberOfGacha * 1000;
    if (userAssets.cash < totalCost) {
      return res.status(400).json({ error: "캐시가 부족합니다." });
    }

    const agents = await prisma.agents.findMany({
      select: {
        agentKey: true,
        name: true,
        grade: true,
      },
    });

    const aAgents = agents.filter((agent) => agent.grade === "a");
    const sAgents = agents.filter((agent) => agent.grade === "s");

    let enhancerCount = 0;
    let countA = 0;
    let countS = 0;

    for (let i = 0; i < numberOfGacha; i++) {
      const random = Math.random();

      if (random <= 0.7) {
        // 70% 확률: 강화재료
        enhancerCount++;
        countA++;
        countS++;
      } else if (random <= 0.94) {
        // 24% 확률: A급 에이전트

        countA = 0;

        await updateMyAgents(user_key, selectedAgent.agentKey);
      } else {
        // 6% 확률: S급 에이전트

        countS = 0;

        await updateMyAgents(user_key, selectedAgent.agentKey);
      }
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "서버 오류" });
  }
});

export default router;
