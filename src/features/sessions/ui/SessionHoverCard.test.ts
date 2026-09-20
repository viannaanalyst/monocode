// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionHoverCard } from "./SessionHoverCard";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(open: boolean) {
  const anchor = createRef<HTMLDivElement>();
  const anchorEl = document.createElement("div");
  document.body.append(anchorEl);
  (anchor as { current: HTMLDivElement | null }).current = anchorEl;
  act(() =>
    root.render(
      createElement(SessionHoverCard, {
        anchor,
        open,
        title: "Análise da Arquitetura",
        branch: "monocode/feat/upstream-picks",
        path: "~/Projetos/monocode",
      }),
    ),
  );
}

describe("SessionHoverCard", () => {
  it("stays hidden when closed", () => {
    render(false);
    expect(document.body.textContent).not.toContain("Análise da Arquitetura");
  });

  it("shows title, branch and folder when open", () => {
    render(true);
    const card = document.querySelector('[role="tooltip"]')!;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("Análise da Arquitetura");
    expect(card.textContent).toContain("monocode/feat/upstream-picks");
    expect(card.textContent).toContain("~/Projetos/monocode");
  });
});
