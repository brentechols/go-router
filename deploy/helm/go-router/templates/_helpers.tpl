{{- define "go-router.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "go-router.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "go-router.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "go-router.labels" -}}
helm.sh/chart: {{ include "go-router.chart" . }}
{{ include "go-router.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "go-router.selectorLabels" -}}
app.kubernetes.io/name: {{ include "go-router.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "go-router.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "go-router.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "go-router.databaseSecretName" -}}
{{- default (printf "%s-database" (include "go-router.fullname" .)) .Values.database.existingSecret }}
{{- end }}

{{- define "go-router.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) }}
{{- end }}

{{- define "go-router.cloudSqlProxyArgs" -}}
- "--structured-logs"
- "--port={{ .Values.cloudSqlProxy.port }}"
- "--health-check"
- "--http-address=0.0.0.0"
- "--http-port={{ .Values.cloudSqlProxy.healthPort }}"
{{- if .Values.cloudSqlProxy.privateIP }}
- "--private-ip"
{{- end }}
{{- if .Values.cloudSqlProxy.autoIamAuthn }}
- "--auto-iam-authn"
{{- end }}
- {{ required "cloudSqlProxy.connectionName is required when the proxy is enabled" .Values.cloudSqlProxy.connectionName | quote }}
{{- end }}
