import { hasAnyRole, hasRole, type CurrentProfile } from "@/lib/profile";

/** Роли, которые создают заявки (инициатор по ТЗ). */
export const REQUEST_INITIATOR_ROLES = ["foreman", "pto"] as const;

export type StagePeople = {
  executor_id?: string | null;
  coexecutor_id?: string | null;
  confirmer_id?: string | null;
  is_closed?: boolean;
  is_excluded?: boolean;
  status_code?: string | null;
};

export function canManageObjects(me: CurrentProfile): boolean {
  return me.is_admin;
}

export function canEditDirectories(me: CurrentProfile): boolean {
  return me.is_admin;
}

export function canCreateRequest(me: CurrentProfile): boolean {
  if (me.is_admin) return true;
  return hasAnyRole(me, REQUEST_INITIATOR_ROLES);
}

/** Удалить заявку — админ и руководитель (roles.is_admin). */
export function canDeleteRequest(me: CurrentProfile): boolean {
  return me.is_admin;
}

/** Работа вне регламента: админ / прораб / ПТО. */
export function canCreateAdhocStage(me: CurrentProfile): boolean {
  if (me.is_admin) return true;
  return hasRole(me, "foreman") || hasRole(me, "pto");
}

export function isRequestInitiatorRole(me: CurrentProfile): boolean {
  return me.is_admin || hasAnyRole(me, REQUEST_INITIATOR_ROLES);
}

export function isRequestOfficeRole(me: CurrentProfile): boolean {
  return me.is_admin || hasRole(me, "office");
}

function isInitiatorRoleCode(role: string | null | undefined): boolean {
  return !!role && (REQUEST_INITIATOR_ROLES as readonly string[]).includes(role);
}

/** Совпадение роли со шагом сценария: прораб и ПТО взаимозаменяемы. */
export function matchesScenarioRole(me: CurrentProfile, scenarioRole: string | null): boolean {
  if (!scenarioRole) return false;
  if (hasRole(me, scenarioRole)) return true;
  return isInitiatorRoleCode(scenarioRole) && hasAnyRole(me, REQUEST_INITIATOR_ROLES);
}

/** Переход статуса заявки вперёд: сценарий или дефолт (ready → прораб/ПТО, иначе офис). */
export function canAdvanceRequestStatus(
  me: CurrentProfile,
  toStatus: string,
  scenarioRole: string | null,
): boolean {
  if (me.is_admin) return true;
  if (scenarioRole) return matchesScenarioRole(me, scenarioRole);
  if (toStatus === "ready") return hasAnyRole(me, REQUEST_INITIATOR_ROLES);
  return hasRole(me, "office");
}

export function canSendRequestToRework(me: CurrentProfile): boolean {
  return me.is_admin || hasRole(me, "office");
}

/** Откат статуса («Назад») — только офис / админ. Прораб и ПТО двигают заявку только вперёд до «Готова». */
export function canRequestStatusBack(me: CurrentProfile): boolean {
  return me.is_admin || hasRole(me, "office");
}

function stageLocked(stage: StagePeople): boolean {
  return !!stage.is_closed || !!stage.is_excluded;
}

/** Править карточку / условия / файлы этапа. */
export function canWorkStage(me: CurrentProfile, stage: StagePeople): boolean {
  if (stageLocked(stage)) return false;
  if (me.is_admin) return true;
  return me.id === stage.executor_id || me.id === stage.coexecutor_id;
}

/** Назначить исполнителя (только админ). */
export function canAssignStage(me: CurrentProfile, stage: StagePeople): boolean {
  return !stageLocked(stage) && me.is_admin;
}

/**
 * Двигать статус этапа (взять, промежуточные, на проверку) — исполнитель / соисполнитель / админ.
 * Без исполнителя «взять в работу» может админ (самоназначение в UI).
 */
export function canChangeStageStatus(me: CurrentProfile, stage: StagePeople): boolean {
  if (stage.is_excluded || stage.is_closed) return false;
  if (me.is_admin) return true;
  return me.id === stage.executor_id || me.id === stage.coexecutor_id;
}

/** Закрыть этап или вернуть с проверки — адресат или админ. */
export function canCloseStage(me: CurrentProfile, stage: StagePeople): boolean {
  if (stageLocked(stage) && stage.is_closed) return false;
  if (stage.is_excluded) return false;
  if (me.is_admin) return true;
  return !!stage.confirmer_id && me.id === stage.confirmer_id;
}

export function canCompleteStageStep(me: CurrentProfile, stage: StagePeople, stepRole: string): boolean {
  if (stageLocked(stage)) return false;
  if (me.is_admin) return true;
  return hasRole(me, stepRole);
}
