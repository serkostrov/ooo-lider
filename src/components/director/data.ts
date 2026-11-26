import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DIRECTOR_KEY = ["director"] as const;

export type DirectorKpi = {
  objectsInWork: number;
  stagesOverdue: number;
  requestsOverdue: number;
  onReview: number;
  noExecutor: number;
  noResponse: number;
  avgProgressPct: number | null;
  stagesOpen: number;
  stagesClosed: number;
  stagesTotal: number;
};

export type WorkTypeReadiness = {
  workType: string;
  shortLabel: string;
  total: number;
  closed: number;
  open: number;
  pct: number;
};

export type ExecutorLoad = {
  executorId: string;
  name: string;
  shortName: string;
  openCount: number;
  roleCode: string | null;
  roleName: string | null;
};

export type ObjectProgress = {
  id: string;
  name: string;
  shortName: string;
  progressPct: number;
  stagesTotal: number;
  stagesClosed: number;
  stagesOverdue: number;
  stagesNoResponse: number;
  stagesOnReview: number;
  stagesNoExecutor: number;
  requestsOverdue: number;
  /** Дней до окончания договора; отрицательное — просрочка. */
  contractDaysLeft: number | null;
  contractEnd: string | null;
};

export type AttentionSlice = {
  key: string;
  label: string;
  hint: string;
  value: number;
  fill: string;
};

export type DirectorListItem = {
  key: string;
  kind: "stage" | "request";
  id: string;
  objectId: string;
  objectName: string;
  title: string;
  dueDate: string | null;
  daysLeft: number | null;
  responsible: string | null;
};

export type DirectorProblemKey =
  | "stagesOverdue"
  | "requestsOverdue"
  | "onReview"
  | "noExecutor"
  | "noResponse";

export type DirectorProblems = Record<DirectorProblemKey, DirectorListItem[]>;

export const DIRECTOR_PROBLEM_META: Record<
  DirectorProblemKey,
  { label: string; hint: string }
> = {
  stagesOverdue: {
    label: "Просроч. этапы",
    hint: "Срок этапа уже прошёл, работа не закрыта",
  },
  requestsOverdue: {
    label: "Просроч. заявки",
    hint: "Заявки с истёкшим сроком исполнения",
  },
  onReview: {
    label: "На проверке",
    hint: "Ждут подтверждения проверяющим",
  },
  noExecutor: {
    label: "Без исполнителя",
    hint: "Этап открыт, но никто не назначен",
  },
  noResponse: {
    label: "Без ответа",
    hint: "Истекло время на ответ по этапу",
  },
};

type ActiveObject = {
  id: string;
  name: string | null;
  progress_pct: number | null;
  stages_total: number | null;
  stages_closed: number | null;
  stages_overdue: number | null;
  stages_no_response: number | null;
  stages_on_review: number | null;
  stages_no_executor: number | null;
  requests_overdue: number | null;
  contract_days_left: number | null;
  contract_end: string | null;
};

type StageRow = {
  id: string | null;
  object_id: string | null;
  name: string | null;
  work_type_name: string | null;
  is_closed: boolean | null;
  is_excluded: boolean | null;
  is_due_soon: boolean | null;
  is_overdue: boolean | null;
  is_no_executor: boolean | null;
  is_no_response: boolean | null;
  status_code: string | null;
  executor_id: string | null;
  executor_name: string | null;
  due_date: string | null;
  days_left: number | null;
};

function stageToItem(
  s: StageRow,
  objectNames: Map<string, string>,
): DirectorListItem | null {
  if (!s.id || !s.object_id) return null;
  return {
    key: `s-${s.id}`,
    kind: "stage",
    id: s.id,
    objectId: s.object_id,
    objectName: objectNames.get(s.object_id) ?? "—",
    title: s.name ?? "Этап",
    dueDate: s.due_date,
    daysLeft: s.days_left,
    responsible: s.executor_name,
  };
}

function byDaysAsc(a: DirectorListItem, b: DirectorListItem) {
  return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function shortLabel(name: string, max = 22) {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function shortPerson(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p && /^[A-Za-zА-Яа-яЁё]/.test(p));
  if (parts.length === 0) return shortLabel(name.trim() || "—", 14);
  if (parts.length === 1) return shortLabel(parts[0]!, 14);
  return `${parts[0]} ${parts[1]![0]!.toUpperCase()}.`;
}

function overdueTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("v_overdue");
}

/** KPI сводки + данные для графиков и списков из одних запросов. */
export function useDirectorDashboard() {
  return useQuery({
    queryKey: [...DIRECTOR_KEY, "dashboard"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [objectsRes, stagesRes, overdueRes, profilesRes] = await Promise.all([
        supabase
          .from("v_objects")
          .select(
            "id, name, progress_pct, stages_total, stages_closed, stages_overdue, stages_no_response, stages_on_review, stages_no_executor, requests_overdue, contract_days_left, contract_end",
          )
          .neq("status", "completed"),
        supabase
          .from("v_object_stages")
          .select(
            "id, object_id, name, work_type_name, is_closed, is_excluded, is_due_soon, is_overdue, is_no_executor, is_no_response, status_code, executor_id, executor_name, due_date, days_left",
          )
          .is("deleted_at", null),
        overdueTable()
          .select("kind, id, object_id, object_name, title, responsible, due_date, days")
          .order("days", { ascending: false })
          .limit(300),
        supabase
          .from("profiles")
          .select("id, role_code, roles!profiles_role_code_fkey(name)")
          .is("deleted_at", null),
      ]);

      if (objectsRes.error) throw objectsRes.error;
      if (stagesRes.error) throw stagesRes.error;
      if (overdueRes.error) throw overdueRes.error;
      if (profilesRes.error) throw profilesRes.error;

      const profileRole = new Map<string, { roleCode: string | null; roleName: string | null }>();
      for (const r of profilesRes.data ?? []) {
        const roles = (r as { roles?: { name: string } | { name: string }[] | null }).roles;
        const roleName = Array.isArray(roles) ? roles[0]?.name ?? null : roles?.name ?? null;
        profileRole.set(r.id as string, {
          roleCode: (r.role_code as string | null) ?? null,
          roleName: roleName?.trim() || null,
        });
      }

      const objects = (objectsRes.data ?? []) as ActiveObject[];
      const activeIds = new Set(objects.map((o) => o.id).filter(Boolean));
      const objectNames = new Map(objects.map((o) => [o.id, o.name ?? "—"]));

      const kpi: DirectorKpi = {
        objectsInWork: objects.length,
        stagesOverdue: 0,
        requestsOverdue: 0,
        onReview: 0,
        noExecutor: 0,
        noResponse: 0,
        avgProgressPct: null,
        stagesOpen: 0,
        stagesClosed: 0,
        stagesTotal: 0,
      };
      let progressSum = 0;
      let progressN = 0;
      for (const o of objects) {
        kpi.stagesOverdue += num(o.stages_overdue);
        kpi.requestsOverdue += num(o.requests_overdue);
        kpi.onReview += num(o.stages_on_review);
        kpi.noExecutor += num(o.stages_no_executor);
        kpi.noResponse += num(o.stages_no_response);
        if (o.progress_pct != null && Number.isFinite(Number(o.progress_pct))) {
          progressSum += Number(o.progress_pct);
          progressN += 1;
        }
      }
      kpi.avgProgressPct = progressN > 0 ? Math.round(progressSum / progressN) : null;

      const stages = ((stagesRes.data ?? []) as StageRow[]).filter(
        (s) => s.object_id && activeIds.has(s.object_id) && !s.is_excluded,
      );
      for (const s of stages) {
        kpi.stagesTotal += 1;
        if (s.is_closed) kpi.stagesClosed += 1;
        else kpi.stagesOpen += 1;
      }

      const byWork = new Map<string, { total: number; closed: number }>();
      for (const s of stages) {
        const key = (s.work_type_name ?? "").trim() || "Без группы";
        const cur = byWork.get(key) ?? { total: 0, closed: 0 };
        cur.total += 1;
        if (s.is_closed) cur.closed += 1;
        byWork.set(key, cur);
      }
      const workTypeReadiness: WorkTypeReadiness[] = [...byWork.entries()]
        .map(([workType, v]) => ({
          workType,
          shortLabel: shortLabel(workType, 26),
          total: v.total,
          closed: v.closed,
          open: v.total - v.closed,
          pct: v.total > 0 ? Math.round((100 * v.closed) / v.total) : 0,
        }))
        .sort((a, b) => a.pct - b.pct || a.workType.localeCompare(b.workType, "ru"));

      const byExecutor = new Map<string, { name: string; openCount: number }>();
      for (const s of stages) {
        if (s.is_closed || !s.executor_id) continue;
        const cur = byExecutor.get(s.executor_id) ?? {
          name: (s.executor_name ?? "").trim() || "Без имени",
          openCount: 0,
        };
        cur.openCount += 1;
        byExecutor.set(s.executor_id, cur);
      }
      const executorLoad: ExecutorLoad[] = [...byExecutor.entries()]
        .map(([executorId, v]) => {
          const role = profileRole.get(executorId);
          return {
            executorId,
            name: v.name,
            shortName: shortPerson(v.name),
            openCount: v.openCount,
            roleCode: role?.roleCode ?? null,
            roleName: role?.roleName ?? null,
          };
        })
        .sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name, "ru"));

      const objectProgress: ObjectProgress[] = objects
        .map((o) => {
          const name = (o.name ?? "").trim() || "Без названия";
          return {
            id: o.id,
            name,
            shortName: shortLabel(name, 28),
            progressPct: Math.round(num(o.progress_pct)),
            stagesTotal: num(o.stages_total),
            stagesClosed: num(o.stages_closed),
            stagesOverdue: num(o.stages_overdue),
            stagesNoResponse: num(o.stages_no_response),
            stagesOnReview: num(o.stages_on_review),
            stagesNoExecutor: num(o.stages_no_executor),
            requestsOverdue: num(o.requests_overdue),
            contractDaysLeft:
              o.contract_days_left == null || !Number.isFinite(Number(o.contract_days_left))
                ? null
                : Number(o.contract_days_left),
            contractEnd: o.contract_end ?? null,
          };
        })
        .sort(
          (a, b) =>
            a.progressPct - b.progressPct ||
            b.stagesOverdue + b.requestsOverdue - (a.stagesOverdue + a.requestsOverdue),
        );

      const attentionMix: AttentionSlice[] = [
        {
          key: "stagesOverdue",
          label: "Просроч. этапы",
          hint: "Срок этапа уже прошёл, работа не закрыта",
          value: kpi.stagesOverdue,
          fill: "var(--danger)",
        },
        {
          key: "requestsOverdue",
          label: "Просроч. заявки",
          hint: "Заявки с истёкшим сроком исполнения",
          value: kpi.requestsOverdue,
          fill: "var(--chart-4)",
        },
        {
          key: "onReview",
          label: "На проверке",
          hint: "Ждут подтверждения проверяющим",
          value: kpi.onReview,
          fill: "var(--chart-1)",
        },
        {
          key: "noExecutor",
          label: "Без исполнителя",
          hint: "Этап открыт, но никто не назначен",
          value: kpi.noExecutor,
          fill: "var(--warning)",
        },
        {
          key: "noResponse",
          label: "Без ответа",
          hint: "Истекло время на ответ по этапу",
          value: kpi.noResponse,
          fill: "var(--chart-3)",
        },
      ].filter((s) => s.value > 0);

      const dueSoon: DirectorListItem[] = stages
        .filter((s) => s.is_due_soon && !s.is_closed && s.id && s.object_id)
        .map((s) => stageToItem(s, objectNames))
        .filter((x): x is DirectorListItem => !!x)
        .sort(byDaysAsc)
        .slice(0, 20);

      type OverdueRow = {
        kind: string;
        id: string;
        object_id: string;
        object_name: string;
        title: string;
        responsible: string | null;
        due_date: string;
        days: number;
      };
      const overdueAll: DirectorListItem[] = ((overdueRes.data ?? []) as OverdueRow[]).map((r) => ({
        key: `${r.kind === "stage" ? "s" : "r"}-${r.id}`,
        kind: r.kind === "stage" ? "stage" : "request",
        id: r.id,
        objectId: r.object_id,
        objectName: r.object_name,
        title: r.title,
        dueDate: r.due_date,
        daysLeft: -Math.abs(num(r.days)),
        responsible: r.responsible,
      }));

      const problems: DirectorProblems = {
        stagesOverdue: overdueAll.filter((i) => i.kind === "stage"),
        requestsOverdue: overdueAll.filter((i) => i.kind === "request"),
        onReview: stages
          .filter((s) => !s.is_closed && s.status_code === "on_review")
          .map((s) => stageToItem(s, objectNames))
          .filter((x): x is DirectorListItem => !!x)
          .sort(byDaysAsc),
        noExecutor: stages
          .filter((s) => !s.is_closed && s.is_no_executor)
          .map((s) => stageToItem(s, objectNames))
          .filter((x): x is DirectorListItem => !!x)
          .sort(byDaysAsc),
        noResponse: stages
          .filter((s) => !s.is_closed && s.is_no_response)
          .map((s) => stageToItem(s, objectNames))
          .filter((x): x is DirectorListItem => !!x)
          .sort(byDaysAsc),
      };

      return {
        kpi,
        workTypeReadiness,
        executorLoad,
        objectProgress,
        attentionMix,
        overdue: overdueAll.slice(0, 40),
        dueSoon,
        problems,
      };
    },
  });
}

export function formatDue(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}
