// Setup dos testes (Vitest + jsdom).
// O jsdom não implementa <canvas>: getContext registra um erro e devolve null.
// Devolvemos null direto (o tema Prisma já trata a ausência de contexto e não anima).
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
