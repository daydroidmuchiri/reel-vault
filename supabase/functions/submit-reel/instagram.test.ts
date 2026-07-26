import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchInstagramCaption } from "./instagram.ts";

Deno.test("returns the title when the oEmbed call succeeds", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ title: "5 tools every founder needs" }), { status: 200 });
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, "5 tools every founder needs");
});

Deno.test("returns null when title is missing", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({}), { status: 200 });
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, null);
});

Deno.test("returns null on a non-2xx response", async () => {
  const fakeFetch = async () => new Response("not found", { status: 404 });
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, null);
});

Deno.test("returns null when the network call throws", async () => {
  const fakeFetch = async () => {
    throw new Error("offline");
  };
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, null);
});
