console.error(
  "Direct compass-official production deployment is disabled in this release baseline. "
    + "Use deploy:cloudflare:library-preview for the reviewed Preview workflow; "
    + "Production deployment requires a separate approved cutover workflow."
);
process.exitCode = 1;
