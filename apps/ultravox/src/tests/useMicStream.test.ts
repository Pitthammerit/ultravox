import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMicStream } from "../hooks/useMicStream";

beforeEach(() => {
  // @ts-expect-error mock
  navigator.mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getAudioTracks: () => [{ stop: vi.fn() }],
    }),
  };
});

describe("useMicStream", () => {
  it("starts with no stream", () => {
    const { result } = renderHook(() => useMicStream());
    expect(result.current.stream).toBeNull();
  });

  it("acquires a stream on start()", async () => {
    const { result } = renderHook(() => useMicStream());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.stream).toBeTruthy();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it("clears stream on stop()", async () => {
    const { result } = renderHook(() => useMicStream());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });
    expect(result.current.stream).toBeNull();
  });

  it("explicitly disables echoCancellation to prevent OS audio ducking", async () => {
    const { result } = renderHook(() => useMicStream());
    await act(async () => {
      await result.current.start();
    });
    const calls = (navigator.mediaDevices.getUserMedia as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastCall = calls[calls.length - 1]![0] as { audio: MediaTrackConstraints };
    expect(lastCall.audio.echoCancellation).toBe(false);
  });
});
