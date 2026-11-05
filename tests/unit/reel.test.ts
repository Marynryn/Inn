import { describe, expect, it } from "vitest";
import { pickSegment } from "../../server/utils/reel";

type Seg = Parameters<typeof pickSegment>[0][number];

const seg = (id: number, over: Partial<Seg> = {}): Seg => ({
  id,
  reelId: 1,
  sortOrder: id,
  label: `#${id}`,
  frameId: null,
  figure: null,
  skinId: null,
  image: null,
  text: null,
  weight: 0,
  stock: null,
  ...over,
});

describe("жребий барабана", () => {
  it("кончившийся тираж из жребия выходит", () => {
    const prize = seg(1, { frameId: 10, weight: 1000, stock: 1 });
    const scene = seg(2, { weight: 0 });
    // Приз выдан один раз из одного — дальше выпадает сценка, даже с нулевым шансом.
    for (let i = 0; i < 50; i++)
      expect(pickSegment([prize, scene], new Map([[1, 1]]))?.id).toBe(2);
  });

  it("пока тираж есть, выпадает по весу", () => {
    const prize = seg(1, { frameId: 10, weight: 1000, stock: 5 });
    const scene = seg(2, { weight: 0 });
    for (let i = 0; i < 50; i++)
      expect(pickSegment([prize, scene], new Map([[1, 4]]))?.id).toBe(1);
  });

  it("шансы делятся примерно по весам", () => {
    const a = seg(1, { weight: 750 });
    const b = seg(2, { weight: 250 });
    let hitsA = 0;
    for (let i = 0; i < 4000; i++)
      if (pickSegment([a, b], new Map())?.id === 1) hitsA++;
    expect(hitsA / 4000).toBeGreaterThan(0.7);
    expect(hitsA / 4000).toBeLessThan(0.8);
  });

  it("разыгрывать нечего — null", () => {
    const gone = seg(1, { frameId: 10, weight: 1000, stock: 1 });
    expect(pickSegment([gone], new Map([[1, 1]]))).toBeNull();
    expect(pickSegment([], new Map())).toBeNull();
  });
});
