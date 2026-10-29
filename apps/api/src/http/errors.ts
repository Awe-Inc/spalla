export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message = "Entre na sua conta para continuar.") => new AppError(401, "nao-autenticado", message);
export const forbidden = (message = "Sua conta não tem permissão para isso.") => new AppError(403, "sem-permissao", message);
export const notFound = (message = "Não encontrado.") => new AppError(404, "nao-encontrado", message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
