export default {
  providers: [
    {
      domain: process.env.CLERK_ISSUER_URL ?? "https://infinite-quail-91.clerk.accounts.dev",
      applicationID: "convex",
    },
  ]
};
