import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoutePlannerApp } from "./RoutePlannerApp";

test("RoutePlannerApp renders duration choices in the main planner form", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /时长/);
  assert.match(markup, /1日/);
  assert.match(markup, /2日/);
});

test("RoutePlannerApp exposes route revision controls in the workbench", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /调整路线/);
  assert.match(markup, /少走路/);
  assert.match(markup, /加吃饭点/);
  assert.match(markup, /重新调整路线/);
});
