import { useCallback, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import type { Control } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../components/ui/form"
import { Switch } from "../../components/ui/switch"
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group"
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert"
import { useToast } from "../../components/ui/use-toast"
import { useAdminSystemSettings, useUpdateAdminSystemSettings } from "../../hooks/useAdminSystemSettings"
import type { SystemSettingRecord, SystemSettingUpdateInput, SystemSettingsByScope } from "../../types/admin"

const formSchema = z.object({
  defaultModel: z.string().min(1, "Default model is required"),
  defaultTemperature: z.number()
    .min(0, "Temperature cannot be negative")
    .max(2, "Temperature cannot exceed 2"),
  defaultMaxTokens: z.number()
    .int("Max tokens must be an integer")
    .positive("Max tokens must be positive"),
  tradingAgentsEnabled: z.boolean(),
  newsEnabled: z.boolean(),
  fundamentalsEnabled: z.boolean(),
  macroEnabled: z.boolean(),
  socialEnabled: z.boolean(),
  explanationLength: z.enum(["compact", "standard", "detailed"]),
})

type FormValues = z.infer<typeof formSchema>

const defaultValues: FormValues = {
  defaultModel: "",
  defaultTemperature: 0.4,
  defaultMaxTokens: 2000,
  tradingAgentsEnabled: true,
  newsEnabled: true,
  fundamentalsEnabled: true,
  macroEnabled: true,
  socialEnabled: false,
  explanationLength: "standard",
}

const explanationOptions: FormValues["explanationLength"][] = ["compact", "standard", "detailed"]

const flattenSettings = (settings?: SystemSettingsByScope): Record<string, SystemSettingRecord> => {
  if (!settings) return {}
  return Object.values(settings).flat().reduce<Record<string, SystemSettingRecord>>((acc, record) => {
    acc[record.key] = record
    return acc
  }, {})
}

const readString = (record: SystemSettingRecord | undefined, fallback: string): string => {
  if (!record || record.value === undefined || record.value === null) {
    return fallback
  }
  if (typeof record.value === "string") return record.value
  return String(record.value)
}

const readNumber = (record: SystemSettingRecord | undefined, fallback: number): number => {
  if (!record || record.value === undefined || record.value === null) {
    return fallback
  }
  if (typeof record.value === "number" && Number.isFinite(record.value)) {
    return record.value
  }
  if (typeof record.value === "string") {
    const parsed = Number.parseFloat(record.value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

const readBoolean = (record: SystemSettingRecord | undefined, fallback: boolean): boolean => {
  if (!record || record.value === undefined || record.value === null) {
    return fallback
  }
  if (typeof record.value === "boolean") {
    return record.value
  }
  if (typeof record.value === "string") {
    const normalized = record.value.toLowerCase()
    if (normalized === "true") return true
    if (normalized === "false") return false
  }
  if (typeof record.value === "number") {
    return record.value !== 0
  }
  return fallback
}

const mapSettingsToFormValues = (settings?: SystemSettingsByScope): FormValues => {
  const map = flattenSettings(settings)
  const explanationRaw = readString(map["ui.explanation_length"], defaultValues.explanationLength)
  const explanationLength = explanationOptions.includes(
    explanationRaw as FormValues["explanationLength"],
  )
    ? (explanationRaw as FormValues["explanationLength"])
    : defaultValues.explanationLength
  return {
    defaultModel: readString(map["llm.default_model"], defaultValues.defaultModel),
    defaultTemperature: readNumber(map["llm.default_temperature"], defaultValues.defaultTemperature),
    defaultMaxTokens: Math.round(readNumber(map["llm.default_max_tokens"], defaultValues.defaultMaxTokens)),
    tradingAgentsEnabled: readBoolean(map["feature.trading_agents_enabled"], defaultValues.tradingAgentsEnabled),
    newsEnabled: readBoolean(map["feature.news_enabled"], defaultValues.newsEnabled),
    fundamentalsEnabled: readBoolean(map["feature.fundamentals_enabled"], defaultValues.fundamentalsEnabled),
    macroEnabled: readBoolean(map["feature.macro_enabled"], defaultValues.macroEnabled),
    socialEnabled: readBoolean(map["feature.social_enabled"], defaultValues.socialEnabled),
    explanationLength,
  }
}

const SystemSettingsPage = () => {
  const { toast } = useToast()
  const settingsQuery = useAdminSystemSettings()
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  })
  const { handleSubmit, control, reset, formState } = form

  const resetFromServer = useCallback(
    (payload?: SystemSettingsByScope) => {
      reset(mapSettingsToFormValues(payload))
    },
    [reset],
  )

  const updateMutation = useUpdateAdminSystemSettings({
    onSuccess: (settings) => {
      resetFromServer(settings)
      toast({
        title: "Settings updated",
        description: "Changes will apply to the next agent run.",
      })
    },
    onError: (error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      })
    },
  })

  useEffect(() => {
    if (settingsQuery.data) {
      resetFromServer(settingsQuery.data)
    }
  }, [settingsQuery.data, resetFromServer])

  const lastUpdated = useMemo(() => {
    if (!settingsQuery.data) return null
    const all = Object.values(settingsQuery.data).flat()
    if (!all.length) return null
    const latest = all.reduce<SystemSettingRecord | null>((acc, record) => {
      if (!acc) return record
      return new Date(record.updatedAt) > new Date(acc.updatedAt) ? record : acc
    }, null)
    return latest?.updatedAt ?? null
  }, [settingsQuery.data])

  const formattedLastUpdated = lastUpdated ? new Date(lastUpdated).toLocaleString() : null

  const onSubmit = (values: FormValues) => {
    const updates: SystemSettingUpdateInput[] = [
      { key: "llm.default_model", value: values.defaultModel, scope: "llm" },
      { key: "llm.default_temperature", value: values.defaultTemperature, scope: "llm" },
      { key: "llm.default_max_tokens", value: values.defaultMaxTokens, scope: "llm" },
      { key: "feature.trading_agents_enabled", value: values.tradingAgentsEnabled, scope: "feature" },
      { key: "feature.news_enabled", value: values.newsEnabled, scope: "feature" },
      { key: "feature.fundamentals_enabled", value: values.fundamentalsEnabled, scope: "feature" },
      { key: "feature.macro_enabled", value: values.macroEnabled, scope: "feature" },
      { key: "feature.social_enabled", value: values.socialEnabled, scope: "feature" },
      { key: "ui.explanation_length", value: values.explanationLength, scope: "ui" },
    ]
    updateMutation.mutate(updates)
  }

  if (settingsQuery.isLoading && !settingsQuery.data) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-border/60 bg-background/60">
        <p className="text-sm text-muted-foreground">Loading system settings...</p>
      </div>
    )
  }

  if (settingsQuery.isError) {
    const message =
      settingsQuery.error instanceof Error ? settingsQuery.error.message : "Unknown error. Please try again."
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Unable to load system settings</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => settingsQuery.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground/70">System Settings</p>
        <h2 className="text-3xl font-semibold tracking-tight">LLM & Feature Controls</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {formattedLastUpdated ? <span>Last updated {formattedLastUpdated}</span> : <span>No changes yet</span>}
          {(settingsQuery.isFetching || updateMutation.isPending) && (
            <span className="text-cyan-300">{updateMutation.isPending ? "Saving…" : "Refreshing…"}</span>
          )}
        </div>
      </section>

      <Form {...form}>
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <Card className="border border-border/70 bg-background/70">
            <CardHeader>
              <CardTitle>LLM Defaults</CardTitle>
              <CardDescription>Baseline model parameters applied when agents do not override settings.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <FormField
                control={control}
                name="defaultModel"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Default model</FormLabel>
                    <FormControl>
                      <Input placeholder="gpt-4o-mini" {...field} />
                    </FormControl>
                    <FormDescription>Used as the fallback model for every persona.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="defaultTemperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temperature</FormLabel>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Mock only</p>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        max="2"
                        inputMode="decimal"
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const next = event.target.value
                          field.onChange(next === "" ? undefined : Number(next))
                        }}
                      />
                    </FormControl>
                    <FormDescription>0 keeps responses deterministic, 2 is most exploratory.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="defaultMaxTokens"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max tokens</FormLabel>
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Mock only</p>
                    <FormControl>
                      <Input
                        type="number"
                        min="256"
                        step="50"
                        inputMode="numeric"
                        value={field.value ?? ""}
                        onChange={(event) => {
                          const next = event.target.value
                          field.onChange(next === "" ? undefined : Number(next))
                        }}
                      />
                    </FormControl>
                    <FormDescription>Upper bound for completions unless a persona overrides it.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-background/70">
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>Disable data sources or personas globally when APIs misbehave.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <ToggleRow
                control={control}
                name="tradingAgentsEnabled"
                label="Trading agents"
                description="Turns the entire trading agents experience on or off."
              />
              <ToggleRow
                control={control}
                name="newsEnabled"
                label="News ingest"
                description="Allows analysts to call news + headline aggregation tools."
              />
              <ToggleRow
                control={control}
                name="fundamentalsEnabled"
                label="Fundamentals"
                description="Permits balance sheet, income statement, and valuation lookups."
              />
              <ToggleRow
                control={control}
                name="macroEnabled"
                label="Macro data"
                description="Enables macro backdrop and FOMC helper tools."
              />
              <ToggleRow
                control={control}
                name="socialEnabled"
                label="Social sentiment"
                description="Gates Reddit/X scraping tools when rate limits spike."
              />
            </CardContent>
          </Card>

          <Card className="border border-border/70 bg-background/70">
            <CardHeader>
              <CardTitle>UI Preferences</CardTitle>
              <CardDescription>Fine-tune how much explanation the trading UI renders by default.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={control}
                name="explanationLength"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Explanation length</FormLabel>
                    <FormControl>
                      <RadioGroup
                        className="grid gap-3 md:grid-cols-3"
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <RadioOption
                          value="compact"
                          title="Compact"
                          description="Short summaries, ideal for mobile or alerts."
                        />
                        <RadioOption
                          value="standard"
                          title="Standard"
                          description="Balanced detail for most workflows."
                        />
                        <RadioOption
                          value="detailed"
                          title="Detailed"
                          description="Full reasoning, best for audits."
                        />
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={updateMutation.isPending || !formState.isDirty}
              onClick={() => resetFromServer(settingsQuery.data)}
            >
              Reset changes
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !formState.isDirty}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

interface ToggleRowProps {
  control: Control<FormValues>
  name: keyof Pick<
    FormValues,
    "tradingAgentsEnabled" | "newsEnabled" | "fundamentalsEnabled" | "macroEnabled" | "socialEnabled"
  >
  label: string
  description: string
}

const ToggleRow = ({ control, name, label, description }: ToggleRowProps) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem className="flex flex-col gap-2 rounded-xl border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <FormLabel className="text-base">{label}</FormLabel>
          <FormDescription>{description}</FormDescription>
        </div>
        <FormControl>
          <Switch checked={field.value} onCheckedChange={field.onChange} />
        </FormControl>
      </FormItem>
    )}
  />
)

interface RadioOptionProps {
  value: FormValues["explanationLength"]
  title: string
  description: string
}

const RadioOption = ({ value, title, description }: RadioOptionProps) => (
  <FormItem className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
    <FormControl>
      <RadioGroupItem value={value} />
    </FormControl>
    <div>
      <FormLabel className="text-base">{title}</FormLabel>
      <FormDescription>{description}</FormDescription>
    </div>
  </FormItem>
)

export default SystemSettingsPage
