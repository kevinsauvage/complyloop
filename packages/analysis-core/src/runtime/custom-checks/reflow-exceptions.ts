/**
 * WCAG 1.4.10 two-dimensional layout exceptions.
 * Horizontal scrolling is legitimate for tables, maps, diagrams, video,
 * and similar content — a naive scrollWidth > clientWidth rule is not.
 */

export function isTwoDimensionalLayout(
  tagName: string,
  role: string | null,
): boolean {
  const tags = [
    "table",
    "img",
    "svg",
    "canvas",
    "video",
    "iframe",
    "pre",
    "map",
  ];
  const roles = ["grid", "treegrid", "img", "application"];
  if (tags.includes(tagName.toLowerCase())) return true;
  return role !== null && roles.includes(role);
}
