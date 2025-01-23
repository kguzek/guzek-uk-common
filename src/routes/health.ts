import { Router } from "express";
import { sendOK } from "../lib/http";

export const router = Router();

router.get("/", (_, res) =>
  sendOK(res, {
    message: "Server is up",
    uptime: process.uptime(),
    date: new Date().toISOString(),
  })
);
