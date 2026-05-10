import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMicStream } from "../hooks/useMicStream";

beforeEach(() => {
  // @ts-expect-error mock
  navigator.mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getAudioTracks: () => [
        { stop: vi.fn(), getSettings: () => ({ autoGainControl: true, noiseSuppression: true, echoCancellation: false }) },
      ],
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

  it("falls back by stripping deviceId FIRST (preserves echoCancellation:false) when preferred is rejected", async () => {
    // Real-world failure mode: stale/exact deviceId triggers
    // OverconstrainedError. Stripping deviceId fixes it, AND we want to
    // keep echoCancellation:false so music doesn't duck. The new ladder
    // tries no-device BEFORE dropping the EC key.
    const fakeStream = {
      getTracks: () => [{ stop: vi.fn() }],
      getAudioTracks: () => [
        { stop: vi.fn(), getSettings: () => ({ echoCancellation: false }) },
      ],
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
      await result.current.start({
        autoGainControl: true,
        noiseSuppression: true,
        echoCancellation: false,
        deviceId: { exact: "stale-device-id" },
      });
    });

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const firstAudio = getUserMedia.mock.calls[0]![0].audio;
    const secondAudio = getUserMedia.mock.calls[1]![0].audio;
    // Level 1: full constraints with deviceId
    expect(firstAudio.deviceId).toEqual({ exact: "stale-device-id" });
    expect(firstAudio.echoCancellation).toBe(false);
    // Level 2 (no-device): deviceId removed, EC:false PRESERVED — this is
    // the whole point of the new ladder (don't sacrifice no-ducking just
    // because deviceId was the rejection trigger).
    expect("deviceId" in secondAudio).toBe(false);
    expect(secondAudio.echoCancellation).toBe(false);
    expect(secondAudio.autoGainControl).toBe(true);
    expect(secondAudio.noiseSuppression).toBe(true);
    expect(result.current.stream).toBeTruthy();
  });

  it("falls through to no-ec-key when both preferred AND no-device are rejected", async () => {
    // Some macOS 26 setups reject EC:false even without a deviceId. Drop
    // the EC key on level 3 so WebKit defaults to true and the stream
    // succeeds. Music ducking returns, but recording works.
    const fakeStream = {
      getTracks: () => [{ stop: vi.fn() }],
      getAudioTracks: () => [
        { stop: vi.fn(), getSettings: () => ({ echoCancellation: true }) },
      ],
    };
    const overconstrained = Object.assign(new Error("Invalid constraint"), {
      name: "OverconstrainedError",
    });
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(overconstrained) // level 1 — preferred
      .mockRejectedValueOnce(overconstrained) // level 2 — no-device
      .mockResolvedValueOnce(fakeStream);     // level 3 — no-ec-key wins
    // @ts-expect-error mock
    navigator.mediaDevices = { getUserMedia };

    const { result } = renderHook(() => useMicStream());
    await act(async () => {
      await result.current.start({
        autoGainControl: true,
        noiseSuppression: true,
        echoCancellation: false,
      });
    });

    expect(getUserMedia).toHaveBeenCalledTimes(3);
    const thirdAudio = getUserMedia.mock.calls[2]![0].audio;
    expect("echoCancellation" in thirdAudio).toBe(false);
    expect(thirdAudio.autoGainControl).toBe(true);
    expect(thirdAudio.noiseSuppression).toBe(true);
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
