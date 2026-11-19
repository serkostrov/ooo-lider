import type { NavigateOptions } from "@tanstack/react-router";
import {
  notificationOpensMessages,
  type NotificationItem,
} from "@/components/notifications/data";

/** Куда вести по клику на уведомление. */
export function notificationNavigateOpts(it: NotificationItem): NavigateOptions {
  if (it.kind === "password_reset" || it.entityType === "profile") {
    return {
      to: "/directories",
      search: { tab: "employees" as const },
    };
  }
  if (it.entityType === "request") {
    return {
      to: "/requests/$requestId",
      params: { requestId: it.entityId },
    };
  }
  return {
    to: "/objects/$id/stages/$stageId",
    params: { id: it.objectId!, stageId: it.entityId },
    ...(notificationOpensMessages(it.kind) ? { search: { tab: "messages" as const } } : {}),
  };
}
