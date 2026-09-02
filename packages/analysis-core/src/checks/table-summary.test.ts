import { describe, expect, it } from "vitest";
import { parseSource } from "../parse";
import { tableSummaryCheck } from "./table-summary";

describe("table-summary", () => {
  it("flags a complex table without summary", () => {
    const source = `const A = () => (
      <table>
        <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>2</td><td>3</td><td>4</td></tr>
          <tr><td>5</td><td>6</td><td>7</td><td>8</td></tr>
          <tr><td>9</td><td>10</td><td>11</td><td>12</td></tr>
          <tr><td>13</td><td>14</td><td>15</td><td>16</td></tr>
        </tbody>
      </table>
    );`;
    expect(tableSummaryCheck.run(parseSource("test.tsx", source))).toHaveLength(1);
  });

  it("accepts aria-describedby on complex tables", () => {
    const source = `const A = () => (
      <table aria-describedby="tbl-desc">
        <thead><tr><th colSpan={2}>Group</th></tr></thead>
        <tbody><tr><td>x</td><td>y</td></tr></tbody>
      </table>
    );`;
    expect(tableSummaryCheck.run(parseSource("test.tsx", source))).toHaveLength(0);
  });

  it("ignores simple small tables", () => {
    const source = `const A = () => (
      <table><tr><th>Name</th><td>Ada</td></tr></table>
    );`;
    expect(tableSummaryCheck.run(parseSource("test.tsx", source))).toHaveLength(0);
  });
});
