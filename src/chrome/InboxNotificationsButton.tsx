import { useRef, useState } from "react";
import { t } from "../i18n";
import { Bell } from "./icons";
import { InboxNotificationMenu } from "./InboxNotificationMenu";

/** Rail-parity Inbox actions: mark all read, mute/resume projects, settings. */
export function InboxNotificationsButton({
  projectPaths,
  onOpenSettings,
}: {
  projectPaths: readonly string[];
  onOpenSettings?: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-no-tooltip
        aria-label={t("Notifications")}
        aria-haspopup="menu"
        aria-expanded={menu != null}
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect();
          if (!rect) return;
          setMenu({ x: rect.right - 244, y: rect.bottom + 4 });
        }}
        className={`grid size-6 shrink-0 place-items-center rounded-md text-content/45 hover:bg-content/10 hover:text-content ${
          menu ? "bg-content/10 text-content" : ""
        }`}
      >
        <Bell className="size-3.5" strokeWidth={1.75} />
      </button>
      {menu ? (
        <InboxNotificationMenu
          x={menu.x}
          y={menu.y}
          projectPaths={projectPaths}
          onOpenSettings={onOpenSettings}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
