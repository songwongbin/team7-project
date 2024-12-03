import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma/index.js';
import dotenv from 'dotenv';

// 환경 변수 설정
dotenv.config();

const SECRET_KEY = process.env.SECRET_KEY; // .env 파일에서 SECRET_KEY 가져오기

// SECRET_KEY가 설정되지 않은 경우 애플리케이션 실행 차단
if (!SECRET_KEY) {
  throw new Error('환경 변수 SECRET_KEY가 설정되지 않았습니다.');
}

// 인증 미들웨어
const authMiddleware = async (req, res, next) => {
  try {
    // 요청 헤더에서 Authorization 값 확인
    const authHeader = req.headers.authorization;

    // Authorization 헤더가 없거나 형식이 잘못된 경우 //startsWith 왜 나왔냐..?...
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: '인증 토큰이 제공되지 않았습니다.' });
    }

    // "Bearer" 이후의 토큰 부분만 추출
    const [tokenType, token] = authorization.split(' ');

    // 토큰 검증
    const decoded = jwt.verify(token, SECRET_KEY);

    //JWT 토큰에서 가져온 사용자 정보를 이용해서 데이터베이스에서 해당 사용자가 실제로 존재하는지 확인하는 작업
    const user = await prisma.users.findUnique({ where: { userKey: decoded.userKey } });

    // 사용자 정보가 데이터베이스에 없는 경우
    if (!user) {
      return res.status(401).json({ message: '유효하지 않은 사용자입니다.' });
    }

    // 사용자 정보를 req 객체에 추가
    req.user = user;

    // 다음 미들웨어로 이동
    next();
  } catch (error) {
    console.error('JWT 검증 실패:', error.message);

    // 에러 종류에 따른 적절한 메시지 반환
    const isTokenExpired = error.name === 'TokenExpiredError'; // 토큰 만료 여부 확인
    const errorMessage = isTokenExpired
      ? '토큰이 만료되었습니다. 다시 로그인해주세요.' // 토큰 만료 메시지
      : '토큰 검증 실패'; // 일반 검증 실패 메시지

    // 검증 실패 응답
    return res.status(401).json({ message: errorMessage, error: error.message });
  }
};

export default authMiddleware;
