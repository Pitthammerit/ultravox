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
    const firstCall = calls[0]![0] as { audio: MediaTrackConstraints };
    expect(firstCall.audio.echoCancellation).toBe(false);
  });

  it("falls back to constraints without echoCancellation when WebKit rejects the preferred set", async () => {
    // First call: WebKit's "Invalid constraint" / OverconstrainedError on macOS 26
    // when echoCancellation:false is requested. Second call: same constraints
    // minus the echoCancellation key → succeeds (stream returned).
    const fakeStream = {
      getTracks: () => [{ stop: vi.fn() }],
      getAudioTracks: () => [{ stop: vi.fn() }],
    };
    const overconstrained = Object.assign(new Error("Invalid constraint"), {
      name: "OverconstrainedError",
    });
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(overconstrained)
      .mockResolvedValueOnce(fakeStream);
    // @ts-expect-error mock
    navigator.mediaDevices = { getUserMedia };

    const { result } = renderHook(() => useMicStream());
    await act(async () => {
      await result.current.start();
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const firstAudio = getUserMedia.mock.calls[0]![0].audio;
    const secondAudio = getUserMedia.mock.calls[1]![0].audio;
    expect(firstAudio.echoCancellation).toBe(false);
    expect("echoCancellation" in secondAudio).toBe(false);
    expect(secondAudio.autoGainControl).toBe(true);
    expect(secondAudio.noiseSuppression).toBe(true);
    expect(result.current.stream).toBeTruthy();
  });

  it("re-throws non-constraint errors immediately (no retry on permission denial)", async () => {
    const notAllowed = Object.assign(new Error("Permission denied"), {
      name: "NotAllowedError",
    });
    const getUserMedia = vi.fn().mockRejectedValue(notAllowed);
    // @ts-expect-error mock
    navigator.mediaDevices = { getUserMedia };

    const { result } = renderHook(() => useMicStream());
    await expect(
      act(async () => {
        await result.current.start();
      }),
    ).rejects.toMatchObject({ name: "NotAllowedError" });
    // Only ONE attempt — don't keep retrying on permission denial.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
