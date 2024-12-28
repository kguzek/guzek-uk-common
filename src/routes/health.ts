import { Router } from "express";
import { sendOK } from "../util";

export const router = Router();

router.get("/", (_, res) => sendOK(res, { message: "Server is up" }));
