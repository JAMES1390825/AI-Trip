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
