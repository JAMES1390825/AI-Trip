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

test("RoutePlannerApp exposes light create entries and planning chips", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /我的行程/);
  assert.match(markup, /创建新计划/);
  assert.match(markup, /智能导入地点\/行程/);
  assert.match(markup, /采集识别/);
  assert.match(markup, /拍照出片/);
  assert.match(markup, /历史古迹/);
  assert.match(markup, /预算友好/);
});

test("RoutePlannerApp renders honest generation progress labels", () => {
  const markup = renderToStaticMarkup(React.createElement(RoutePlannerApp));

  assert.match(markup, /理解旅行需求/);
  assert.match(markup, /高德搜索真实地点/);
  assert.match(markup, /Exa 检索公开攻略证据/);
  assert.match(markup, /不展示未接入来源/);
  assert.doesNotMatch(markup, /正在搜索小红书官方/);
});
