import { writeAuthStates } from "./auth";

export default async function globalSetup(): Promise<void> {
  await writeAuthStates();
}
