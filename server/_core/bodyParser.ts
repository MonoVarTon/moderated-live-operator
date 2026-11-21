import express, { type Express } from "express";

export const API_BODY_LIMIT_BYTES = 16 * 1024;

export function installBodyParsers(app: Express): void {
  app.use(express.json({ limit: API_BODY_LIMIT_BYTES, strict: true }));
  app.use(
    express.urlencoded({
      limit: API_BODY_LIMIT_BYTES,
      extended: false,
      parameterLimit: 100,
    })
  );
}
