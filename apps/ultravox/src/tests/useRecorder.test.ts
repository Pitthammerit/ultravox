import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRecorder } from "../hooks/useRecorder";

describe("useRecorder", () => {
  it("initializes idle", () => {
    const { result } = renderHook(() => useRecorder());
    expect(result.current.state).toBe("idle");
  });

  it("exposes start / stop / cancel", () => {
    const { result } = renderHook(() => useRecorder());
    expect(typeof result.current.start).toBe("function");
    expect(typeof result.current.stop).toBe("function");
    expect(typeof result.current.cancel).toBe("function");
  });

  it("starts with null audioBlob and null error", () => {
    const { result } = renderHook(() => useRecorder());
    expect(result.current.audioBlob).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
