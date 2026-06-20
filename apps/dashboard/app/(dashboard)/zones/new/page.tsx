"use client";

import { useRouter } from "next/navigation";
import { ZoneForm, type ZoneFormValues } from "../../../../components/ZoneForm";

export default function NewZonePage() {
  const router = useRouter();

  async function handleSubmit(values: ZoneFormValues) {
    const response = await fetch("/api/zones", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        geofence: values.geofence,
        silenceContract: values.silenceContract,
        rewardConfig: values.rewardConfig,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.error === "string" ? body.error : "Failed to create zone.");
    }
    const zone = await response.json();
    router.push(`/zones/${zone.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-light tracking-wide">New zone</h1>
      <ZoneForm onSubmit={handleSubmit} submitLabel="Create zone" />
    </div>
  );
}
