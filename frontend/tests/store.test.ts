import { describe, expect, it } from "vitest";
import { DocStore, memoryStorage, WELCOME } from "../src/store";

describe("DocStore", () => {
  it("starts with a welcome document", () => {
    const s = new DocStore(memoryStorage());
    expect(s.list()).toHaveLength(1);
    expect(s.active().text).toBe(WELCOME);
  });

  it("recovers documents, the active one and settings after a reload", () => {
    const storage = memoryStorage();
    const a = new DocStore(storage);
    const doc = a.create("notes.md", "draft text", "old text");
    a.update(doc.id, { text: "newer draft" });
    a.updateSettings({ flavour: "extended", view: "preview", outline: true });

    const b = new DocStore(storage);
    expect(b.list().map((d) => d.name)).toEqual(["welcome.md", "notes.md"]);
    expect(b.active().text).toBe("newer draft");
    expect(b.active().saved).toBe("old text");
    expect(b.settings).toMatchObject({ flavour: "extended", view: "preview", outline: true });
  });

  it("tracks unsaved changes against the last saved text", () => {
    const s = new DocStore(memoryStorage());
    const doc = s.create("a.md", "x", "x");
    expect(DocStore.isDirty(doc)).toBe(false);
    s.update(doc.id, { text: "y" });
    expect(DocStore.isDirty(s.active())).toBe(true);
    s.update(doc.id, { saved: "y" });
    expect(DocStore.isDirty(s.active())).toBe(false);
  });

  it("treats a new empty document as clean and a typed one as dirty", () => {
    const s = new DocStore(memoryStorage());
    expect(DocStore.isDirty(s.create("n.md", ""))).toBe(false);
    s.update(s.active().id, { text: "hi" });
    expect(DocStore.isDirty(s.active())).toBe(true);
  });

  it("removes documents and never ends up with none", () => {
    const s = new DocStore(memoryStorage());
    const second = s.create("b.md", "b");
    s.remove(second.id);
    expect(s.list()).toHaveLength(1);
    s.remove(s.active().id);
    expect(s.list()).toHaveLength(1);
    expect(s.active().text).toBe("");
  });

  it("skips corrupt entries and bad settings instead of failing", () => {
    const storage = memoryStorage();
    const a = new DocStore(storage);
    const good = a.create("good.md", "ok");
    storage.setItem("vgm:doc:broken", "{not json");
    const index = JSON.parse(storage.getItem("vgm:index") ?? "{}") as { order: string[]; settings: unknown };
    index.order.push("broken", "missing");
    index.settings = { flavour: "nope", view: 7, syncScroll: "yes" };
    storage.setItem("vgm:index", JSON.stringify(index));
    const b = new DocStore(storage);
    expect(b.list().map((d) => d.id)).toContain(good.id);
    expect(b.list()).toHaveLength(2);
    expect(b.settings.flavour).toBe("gfm");
    expect(b.settings.view).toBe("split");
  });

  it("recovers from a corrupt index", () => {
    const storage = memoryStorage();
    storage.setItem("vgm:index", "garbage");
    expect(new DocStore(storage).list()).toHaveLength(1);
  });

  it("reports a full or blocked storage instead of throwing", () => {
    const storage = memoryStorage();
    const s = new DocStore(storage);
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    s.update(s.active().id, { text: "more" });
    expect(s.lastError).toContain("full");
    expect(s.active().text).toBe("more");
  });
});
