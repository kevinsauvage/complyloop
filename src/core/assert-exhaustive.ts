export function assertExhaustive(value: string, kind: string): never {
  throw new Error(`Unhandled ${kind}: ${value}`);
}