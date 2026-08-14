import { PublicError } from "@/core/public-error";

export class ConnectError extends PublicError {
  constructor(message: string) {
    super(message, "connect");
    this.name = "ConnectError";
  }
}
