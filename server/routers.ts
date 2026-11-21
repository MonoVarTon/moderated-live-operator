import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  cancelLiveDraftForClient,
  createLiveDraftForClient,
  getLiveDraftMode,
} from "./liveDraft";

const liveDraftOperatorProcedure = publicProcedure.use(({ ctx, next }) => {
  const isAdmin = ctx.user?.role === "admin";
  const remoteAddress = (ctx.req.socket.remoteAddress ?? "")
    .toLowerCase()
    .replace(/^::ffff:/u, "");
  const isLoopback =
    remoteAddress === "::1" || remoteAddress.startsWith("127.");
  const isLocalDemo =
    process.env.NODE_ENV === "development" &&
    getLiveDraftMode() === "offline-demo" &&
    isLoopback;

  if (!isAdmin && !isLocalDemo) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "An authenticated operator is required for draft generation.",
    });
  }
  return next();
});

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  live: router({
    mode: publicProcedure.query(() => getLiveDraftMode()),
    draft: liveDraftOperatorProcedure
      .input(
        z
          .object({
            fixtureId: z.enum(["T01", "T02", "T03"]),
            requestId: z.string().uuid(),
          })
          .strict()
      )
      .mutation(({ ctx, input }) => {
        const remoteAddress = (ctx.req.socket.remoteAddress ?? "")
          .toLowerCase()
          .replace(/^::ffff:/u, "");
        const requesterKey = ctx.user
          ? `user:${ctx.user.openId}`
          : `ip:${remoteAddress || "unknown"}`;
        return createLiveDraftForClient(
          input.fixtureId,
          requesterKey,
          input.requestId
        );
      }),
    cancelDraft: liveDraftOperatorProcedure
      .input(z.object({ requestId: z.string().uuid() }).strict())
      .mutation(({ ctx, input }) => {
        const remoteAddress = (ctx.req.socket.remoteAddress ?? "")
          .toLowerCase()
          .replace(/^::ffff:/u, "");
        const requesterKey = ctx.user
          ? `user:${ctx.user.openId}`
          : `ip:${remoteAddress || "unknown"}`;
        return {
          cancelled: cancelLiveDraftForClient(requesterKey, input.requestId),
        };
      }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
