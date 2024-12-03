import express from "express";
import matchRouter from "./routes/match-router.js";

/* express 생성 */
const app = express();
const PORT = 9999; // 미정!!!!

/* Parser */
app.use(express.json()); // 바디 파서

/* 라우터 경로 배정 */
app.use("/api", [matchRouter]);

/* 서버 오픈 알리미 */
app.listen(PORT, () => {
  console.log(PORT, "포트로 서버 열림!");
});
