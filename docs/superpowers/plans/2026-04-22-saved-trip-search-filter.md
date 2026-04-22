# Saved Trip Search Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local search and quick filtering to the saved trips screen without changing backend APIs.

**Architecture:** Keep saved-plan fetching unchanged, but move filter logic into a pure helper and let `TripsScreen` render a search input, filter chips, and derived empty states from that helper output.

**Tech Stack:** React Native + Expo, TypeScript, `node:test`, existing mobile test runner, repo `verify-fast`

---

## File Map

- `apps/mobile-ios/src/screens/saved-plan-filters.ts`
  Pure local search/filter helper for saved plan lists.
- `apps/mobile-ios/src/screens/saved-plan-filters.test.ts`
  Unit tests for search and filter behavior.
- `apps/mobile-ios/src/screens/TripsScreen.tsx`
  Search input, filter chips, derived list rendering, and filtered empty states.

## Task 1: Add And Test Saved Plan Filter Logic

**Files:**
- Create: `apps/mobile-ios/src/screens/saved-plan-filters.ts`
- Create: `apps/mobile-ios/src/screens/saved-plan-filters.test.ts`
- Test: `apps/mobile-ios/src/screens/saved-plan-filters.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mobile-ios/src/screens/saved-plan-filters.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { filterSavedPlans } from "./saved-plan-filters";

const sample = [
  { id: "1", destination: "上海", start_date: "2026-05-01", confidence: 0.9, saved_at: "2026-04-20T08:00:00Z", updated_at: "2026-04-20T08:00:00Z", granularity: "day" },
  { id: "2", destination: "杭州", start_date: "2026-04-01", confidence: 0.45, saved_at: "2026-04-18T08:00:00Z", updated_at: "2026-04-18T08:00:00Z", granularity: "day" },
] as any;

test("filterSavedPlans matches destination query", () => {
  const items = filterSavedPlans(sample, "上", "all", "2026-04-22");
  assert.equal(items.length, 1);
  assert.equal(items[0].destination, "上海");
});

test("filterSavedPlans keeps only future trips for upcoming filter", () => {
  const items = filterSavedPlans(sample, "", "upcoming", "2026-04-22");
  assert.equal(items.length, 1);
  assert.equal(items[0].destination, "上海");
});

test("filterSavedPlans keeps only high confidence trips", () => {
  const items = filterSavedPlans(sample, "", "high_confidence", "2026-04-22");
  assert.equal(items.length, 1);
  assert.equal(items[0].destination, "上海");
});
```

- [ ] **Step 2: Run tests and verify the helper is missing**

Run: `cd apps/mobile-ios && npm run test`

Expected: FAIL with `Cannot find module './saved-plan-filters'`.

- [ ] **Step 3: Implement the helper**

Create `apps/mobile-ios/src/screens/saved-plan-filters.ts`:

```ts
import type { SavedPlanListItem } from "../types/plan";

export type SavedPlanFilterKey = "all" | "upcoming" | "high_confidence";

function normalize(value: string): string {
  return String(value || "").trim().toLowerCase();
}

export function filterSavedPlans(
  items: SavedPlanListItem[],
  query: string,
  filter: SavedPlanFilterKey,
  today: string,
): SavedPlanListItem[] {
  const normalizedQuery = normalize(query);
  return items.filter((item) => {
    const matchesQuery =
      !normalizedQuery ||
      normalize(item.destination).includes(normalizedQuery) ||
      normalize(item.start_date).includes(normalizedQuery);

    if (!matchesQuery) return false;

    switch (filter) {
      case "upcoming":
        return String(item.start_date || "") >= today;
      case "high_confidence":
        return Number(item.confidence || 0) >= 0.7;
      default:
        return true;
    }
  });
}
```

- [ ] **Step 4: Run tests to verify the helper passes**

Run: `cd apps/mobile-ios && npm run test`

Expected: PASS with the new saved-plan filter tests.

## Task 2: Render Search And Filter UI In `TripsScreen`

**Files:**
- Modify: `apps/mobile-ios/src/screens/TripsScreen.tsx`
- Test: `apps/mobile-ios/src/screens/saved-plan-filters.test.ts`

- [ ] **Step 1: Import the helper and add local UI state**

Add:

```ts
import { TextInput } from "react-native";
import { filterSavedPlans, type SavedPlanFilterKey } from "./saved-plan-filters";
```

Add state:

```ts
const [query, setQuery] = useState("");
const [filter, setFilter] = useState<SavedPlanFilterKey>("all");
```

- [ ] **Step 2: Derive the filtered list**

Add:

```ts
const filteredItems = useMemo(
  () => filterSavedPlans(items, query, filter, new Date().toISOString().slice(0, 10)),
  [items, query, filter],
);
```

- [ ] **Step 3: Render the search input and chips above the list**

Add:

```tsx
      <View style={styles.filterCard}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="搜索目的地或日期"
          placeholderTextColor="#8da0b5"
        />
        <View style={styles.filterRow}>
          {[
            { key: "all", label: "全部" },
            { key: "upcoming", label: "即将出发" },
            { key: "high_confidence", label: "高可信" },
          ].map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}
                onPress={() => setFilter(item.key as SavedPlanFilterKey)}
              >
                <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
```

- [ ] **Step 4: Switch list rendering and empty state to use `filteredItems`**

Replace `items.length` checks with `filteredItems.length`, and map over `filteredItems`.

For the empty state text, use:

```tsx
          <Text style={styles.emptyTitle}>{items.length ? "没有匹配结果" : "还没有可回看的行程"}</Text>
          <Text style={styles.emptyText}>
            {items.length ? "换个目的地关键词，或者切回“全部”看看。" : "去“规划”页完成一次生成并保存后，这里会出现服务端保存的 itinerary。"}
          </Text>
```

- [ ] **Step 5: Add styles and run verification**

Add:

```ts
  filterCard: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 12,
  },
  searchInput: {
    borderRadius: 14,
    backgroundColor: "#f4f8fd",
    borderWidth: 1,
    borderColor: "#dbe7f2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#173051",
    fontSize: 15,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: 14,
    backgroundColor: "#eef4fb",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: "#173051",
  },
  filterChipText: {
    color: "#5d728d",
    fontSize: 13,
    fontWeight: "800",
  },
  filterChipTextActive: {
    color: "#ffffff",
  },
```

Run:

```bash
cd apps/mobile-ios && npm run test
cd apps/mobile-ios && npm run typecheck
bash scripts/dev.sh verify-fast
```

- [ ] **Step 6: Commit the feature**

```bash
git add apps/mobile-ios/src/screens/saved-plan-filters.ts apps/mobile-ios/src/screens/saved-plan-filters.test.ts apps/mobile-ios/src/screens/TripsScreen.tsx docs/superpowers/specs/2026-04-22-saved-trip-search-filter-design.md docs/superpowers/plans/2026-04-22-saved-trip-search-filter.md
git commit -m "feat: add saved trip search and filters"
```
