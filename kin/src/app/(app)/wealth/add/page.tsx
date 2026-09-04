import { DetailHeader } from "@/components/hub-header";
import { AddGoalForm } from "./add-goal-form";

export default function AddGoalPage() {
  return (
    <div>
      <DetailHeader backHref="/wealth" eyebrow="HUB 05 · NEW" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 32, margin: "0 0 14px" }}>Add Goal</h3>
        <AddGoalForm />
      </div>
    </div>
  );
}
