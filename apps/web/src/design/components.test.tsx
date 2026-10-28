import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button, GoalDots, HeadphoneNotice, ProgressRing, Stars, StringChip } from "./components";

describe("Stars", () => {
  it("announces the count out of three", () => {
    render(<Stars count={2} />);
    expect(screen.getByRole("img", { name: "2 de 3 estrelas" })).toBeInTheDocument();
  });

  it("uses the visible label as the accessible name when one is given", () => {
    render(<Stars count={3} label="3 de 3 estrelas" />);
    expect(screen.getAllByRole("img", { name: "3 de 3 estrelas" })).toHaveLength(1);
  });
});

describe("GoalDots", () => {
  it("draws one dot per repetition and names the series for screen readers", () => {
    const { container } = render(<GoalDots recentClean={[true, false]} total={3} label="1 de 3 limpas seguidas" />);
    expect(screen.getByRole("img", { name: "1 de 3 limpas seguidas" })).toBeInTheDocument();
    const dots = container.querySelectorAll("span > span");
    expect(dots).toHaveLength(3);
    expect(dots[0]?.className).toContain("bg-in-tune");
    expect(dots[1]?.className).toContain("bg-off");
    expect(dots[2]?.className).toContain("bg-hairline-strong");
  });
});

describe("StringChip", () => {
  it("names the four strings in Portuguese", () => {
    render(
      <>
        <StringChip index={0} />
        <StringChip index={3} />
      </>,
    );
    expect(screen.getByText("Sol")).toBeInTheDocument();
    expect(screen.getByText("Mi")).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("defaults to type button and forwards clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Tocar</Button>);
    const button = screen.getByRole("button", { name: "Tocar" });
    expect(button).toHaveAttribute("type", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("ProgressRing", () => {
  it("shows the value and caption", () => {
    render(<ProgressRing value={12} max={20} caption="de 20 min" />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("de 20 min")).toBeInTheDocument();
  });
});

describe("HeadphoneNotice", () => {
  it("confirms with one click", async () => {
    const onConfirm = vi.fn();
    render(<HeadphoneNotice onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole("button", { name: "Estou de fone" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
