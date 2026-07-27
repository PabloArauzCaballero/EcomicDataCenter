from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
API = "/api/v1"

UUID = {"type": "string", "format": "uuid"}
DATE = {"type": "string", "format": "date"}
DATETIME = {"type": "string", "format": "date-time"}

def obj(properties, required=(), additional=False):
    value = {"type": "object", "properties": properties, "additionalProperties": additional}
    if required:
        value["required"] = list(required)
    return value

def array(items, maximum=None):
    value = {"type": "array", "items": items}
    if maximum is not None:
        value["maxItems"] = maximum
    return value

def ref(name):
    return {"$ref": f"#/components/schemas/{name}"}

def response(description, schema=None):
    content = {"description": description}
    if schema:
        content["content"] = {"application/json": {"schema": schema}}
    return content

def operation(operation_id, summary, tag, roles, request_schema=None, parameters=None, public=False, response_schema=None):
    item = {
        "operationId": operation_id,
        "summary": summary,
        "tags": [tag],
        "responses": {
            "200": response("Successful operation", response_schema or {"type": "object", "additionalProperties": True}),
            "400": response("Invalid request", ref("ErrorResponse")),
            "401": response("Authentication required", ref("ErrorResponse")),
            "403": response("Insufficient permissions", ref("ErrorResponse")),
            "409": response("Conflict", ref("ErrorResponse")),
            "422": response("Business rule violation", ref("ErrorResponse")),
            "429": response("Rate limit exceeded", ref("ErrorResponse")),
            "500": response("Unexpected error", ref("ErrorResponse")),
            "503": response("Dependency unavailable", ref("ErrorResponse")),
        },
    }
    if roles:
        item["x-required-roles"] = roles
    item["security"] = [] if public else [{"bearerAuth": []}]
    if request_schema:
        item["requestBody"] = {
            "required": True,
            "content": {"application/json": {"schema": ref(request_schema)}},
        }
    if parameters:
        item["parameters"] = parameters
    return item

id_param = lambda name="id": {
    "name": name,
    "in": "path",
    "required": True,
    "schema": UUID if name == "id" else {"type": "string", "pattern": "^\\d+$"},
}
page_params = [
    {"name": "page", "in": "query", "schema": {"type": "integer", "minimum": 1, "default": 1}},
    {"name": "pageSize", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50}},
    {"name": "search", "in": "query", "schema": {"type": "string", "maxLength": 120}},
]

schemas = {
    "ErrorResponse": obj({
        "error": obj({
            "code": {"type": "string"},
            "message": {"type": "string"},
            "details": {"type": "object", "additionalProperties": True},
        }, ("code", "message")),
        "requestId": {"type": "string"},
    }, ("error", "requestId")),
    "OrganizationInput": obj({
        "parentOrganizationId": UUID, "code": {"type": "string", "maxLength": 50},
        "legalName": {"type": "string"}, "shortName": {"type": "string"},
        "organizationType": {"type": "string"}, "countryCode": {"type": "string", "pattern": "^[A-Z]{2}$"},
        "officialStatisticsProducer": {"type": "boolean"}, "isActive": {"type": "boolean"},
        "validFrom": DATE, "validTo": DATE,
    }, ("code", "legalName", "shortName", "organizationType", "countryCode", "officialStatisticsProducer", "validFrom")),
    "SourceInput": obj({
        "organizationId": UUID, "frequencyId": UUID, "code": {"type": "string"}, "name": {"type": "string"},
        "sourceType": {"type": "string"}, "accessMethod": {"type": "string"},
        "officialUri": {"type": "string", "format": "uri"}, "licenseCode": {"type": "string"},
        "activeFrom": DATE, "activeTo": DATE, "isActive": {"type": "boolean"},
    }, ("organizationId", "code", "name", "sourceType", "accessMethod")),
    "SourceArtifactInput": obj({
        "sourceId": UUID, "artifactType": {"type": "string"}, "originalFilename": {"type": "string"},
        "originalUri": {"type": "string", "format": "uri"}, "storageUri": {"type": "string"},
        "mimeType": {"type": "string"}, "sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
        "publicationDate": DATE, "retrievedAt": DATETIME, "fileSizeBytes": {"type": "string", "pattern": "^\\d+$"},
        "metadataJson": {"type": "object", "additionalProperties": True},
    }, ("sourceId", "artifactType", "storageUri", "sha256", "retrievedAt")),
    "DimensionValue": obj({
        "dimensionDefinitionId": UUID, "codeItemId": UUID, "classificationItemId": UUID,
        "geographicUnitId": UUID, "textValue": {"type": "string"},
        "numericValue": {"type": "string"}, "dateValue": DATE,
    }, ("dimensionDefinitionId",)),
    "MeasureValue": obj({
        "measureDefinitionId": UUID, "numericValue": {"type": "string"},
        "textValue": {"type": "string"}, "booleanValue": {"type": "boolean"},
    }, ("measureDefinitionId",)),
    "AttributeValue": obj({
        "attributeDefinitionId": UUID, "codeItemId": UUID, "numericValue": {"type": "string"},
        "textValue": {"type": "string"}, "booleanValue": {"type": "boolean"},
    }, ("attributeDefinitionId",)),
    "ObservationRecord": obj({
        "indicatorVersionId": UUID, "frequencyId": UUID, "unitMeasureId": UUID,
        "periodStart": DATE, "periodEnd": DATE, "periodCode": {"type": "string"}, "referenceDate": DATE,
        "dimensions": array(ref("DimensionValue"), 50), "measures": array(ref("MeasureValue"), 50),
        "attributes": array(ref("AttributeValue"), 50), "confidentialityStatus": {"type": "string"},
        "publicationDate": DATE, "vintageDate": DATE, "revisionReason": {"type": "string"},
    }, ("frequencyId", "periodStart", "periodEnd", "periodCode", "dimensions", "measures", "confidentialityStatus", "vintageDate")),
    "RegisterObservationInput": obj({
        "batchCode": {"type": "string", "minLength": 3, "maxLength": 80},
        "datasetVersionId": UUID, "sourceArtifactId": UUID, "submittedByOrganizationId": UUID,
        "record": ref("ObservationRecord"),
    }, ("batchCode", "datasetVersionId", "sourceArtifactId", "submittedByOrganizationId", "record")),
    "ObservationBatchInput": obj({
        "datasetVersionId": UUID, "sourceArtifactId": UUID, "submittedByOrganizationId": UUID,
        "batchCode": {"type": "string"}, "entryMethod": {"type": "string", "enum": ["FILE", "API", "SDMX", "DATABASE", "MANUAL"]},
        "notes": {"type": "string"}, "records": array(ref("ObservationRecord"), 500),
    }, ("datasetVersionId", "sourceArtifactId", "submittedByOrganizationId", "batchCode", "entryMethod", "records")),
    "RegistrationResult": obj({
        "status": {"type": "string", "enum": ["PUBLISHED", "REJECTED", "UNCHANGED"]},
        "batchId": UUID, "seriesId": UUID,
        "observationId": {"type": "string", "pattern": "^\\d+$"},
        "observationRevisionId": {"type": "string", "pattern": "^\\d+$"},
        "revisionNumber": {"type": "integer", "minimum": 1},
        "qualityIssueIds": array(UUID),
    }, ("status", "batchId", "seriesId", "observationId", "qualityIssueIds")),
    "BatchRecordResult": obj({
        "index": {"type": "integer", "minimum": 0},
        "status": {"type": "string", "enum": ["PUBLISHED", "REJECTED", "UNCHANGED", "INVALID"]},
        "observationId": {"type": "string", "pattern": "^\\d+$"},
        "revisionId": {"type": "string", "pattern": "^\\d+$"},
        "error": obj({"code": {"type": "string"}, "message": {"type": "string"}}, ("code", "message")),
    }, ("index", "status")),
    "BatchImportResult": obj({
        "batchId": UUID,
        "status": {"type": "string", "enum": ["COMMITTED", "PARTIAL", "REJECTED"]},
        "receivedCount": {"type": "integer", "minimum": 1},
        "acceptedCount": {"type": "integer", "minimum": 0},
        "rejectedCount": {"type": "integer", "minimum": 0},
        "records": array(ref("BatchRecordResult"), 500),
    }, ("batchId", "status", "receivedCount", "acceptedCount", "rejectedCount", "records")),
    "DataQueryInput": obj({
        "datasetVersionId": UUID, "indicatorVersionId": UUID, "periodFrom": DATE, "periodTo": DATE,
        "vintageDate": DATE, "dimensions": array(ref("DimensionValue"), 20),
        "page": {"type": "integer", "minimum": 1}, "pageSize": {"type": "integer", "minimum": 1, "maximum": 200},
        "sortDirection": {"type": "string", "enum": ["asc", "desc"]},
    }, ("datasetVersionId",)),
    "VersionTransitionInput": obj({"targetStatus": {"type": "string"}}, ("targetStatus",)),
    "IssueTransitionInput": obj({
        "targetStatus": {"type": "string", "enum": ["TRIAGED", "IN_CORRECTION", "RESOLVED", "VERIFIED", "CLOSED", "REOPENED", "DISMISSED"]},
        "resolutionNotes": {"type": "string"},
    }, ("targetStatus",)),
}

# Governance payloads remain explicit at the top level while nested versioned structures are open for forward-compatible metadata fields.
for name, required in {
    "DomainInput": ["code", "name"], "ConceptInput": ["ownerOrganizationId", "code", "name", "definition", "conceptType"],
    "FrequencyInput": ["code", "name"], "UnitInput": ["code", "name", "valueKind"],
    "GeographyInput": ["officialCode", "name", "geographicLevel", "validFrom"],
    "CodeListInput": ["ownerOrganizationId", "code", "name", "versionCode", "items"],
    "ClassificationInput": ["custodianOrganizationId", "code", "name", "classificationType", "version"],
    "ClassificationMappingInput": ["sourceItemId", "targetItemId", "equivalenceType"],
    "StatisticalOperationInput": ["producerOrganizationId", "code", "name", "operationType", "objective", "status"],
    "MethodologyInput": ["ownerOrganizationId", "code", "name", "methodologyType", "isOfficial", "version"],
    "MethodologyVersionInput": ["versionCode", "title", "status", "validFrom"],
    "DataStructureInput": ["ownerOrganizationId", "code", "name", "versionCode", "dimensions", "measures"],
    "DatasetInput": ["sourceId", "producerOrganizationId", "statisticalDomainId", "code", "name", "dataNature", "publicationStatus", "confidentialityLevel", "version"],
    "DatasetVersionInput": ["methodologyVersionId", "dataStructureId", "versionCode", "title", "status", "validFrom"],
    "IndicatorInput": ["statisticalDomainId", "ownerOrganizationId", "code", "name", "definition", "indicatorType", "dataNature", "version"],
    "QualityDimensionInput": ["code", "name"], "QualityRuleInput": ["qualityDimensionId", "code", "name", "ruleType", "severity", "targetEntityType", "configurationJson"],
    "LineageRelationInput": ["sourceEntityType", "sourceEntityId", "targetEntityType", "targetEntityId", "relationType"],
    "IndicatorRelationInput": ["sourceIndicatorVersionId", "targetIndicatorVersionId", "relationType"],
    "SeriesBreakInput": ["seriesId", "breakDate", "breakType", "reason", "isComparableBeforeAfter"],
}.items():
    schemas[name] = {"type": "object", "required": required, "additionalProperties": True}

paths = {
    "/health": {"get": operation("health", "Process liveness", "Operations", [], public=True)},
    "/ready": {"get": operation("ready", "Critical dependency readiness", "Operations", [], public=True)},
    "/metrics": {"get": operation("metrics", "Prometheus metrics when enabled", "Operations", [], public=True)},
    f"{API}/provenance/organizations": {
        "post": operation("createOrganization", "Create producer or custodian organization", "Provenance", ["METHODOLOGY_STEWARD"], "OrganizationInput"),
        "get": operation("listOrganizations", "List organizations", "Provenance", ["ANALYST", "METHODOLOGY_STEWARD"], parameters=page_params),
    },
    f"{API}/provenance/sources": {
        "post": operation("createSource", "Create statistical source", "Provenance", ["METHODOLOGY_STEWARD"], "SourceInput"),
        "get": operation("listSources", "List sources", "Provenance", ["ANALYST", "METHODOLOGY_STEWARD"], parameters=page_params),
    },
    f"{API}/provenance/artifacts": {"post": operation("registerSourceArtifact", "Register immutable source artifact", "Provenance", ["DATA_OFFICER"], "SourceArtifactInput")},
    f"{API}/provenance/artifacts/{{id}}": {"get": operation("getSourceArtifact", "Get source artifact metadata", "Provenance", ["DATA_OFFICER", "METHODOLOGY_STEWARD"], parameters=[id_param()])},
    f"{API}/data/observations": {"post": operation("registerObservation", "Register or revise one observation", "Data ingestion", ["DATA_OFFICER"], "RegisterObservationInput", response_schema=ref("RegistrationResult"))},
    f"{API}/data/observation-batches": {"post": operation("importObservationBatch", "Import up to 500 observations with partial results", "Data ingestion", ["DATA_OFFICER"], "ObservationBatchInput", response_schema=ref("BatchImportResult"))},
    f"{API}/data/query": {"post": operation("queryObservations", "Query current or vintage observations", "Data query", ["ANALYST", "METHODOLOGY_STEWARD"], "DataQueryInput")},
    f"{API}/data/observations/{{observationId}}/revisions/{{revisionId}}/trace": {"get": operation("getObservationTrace", "Get provenance, quality and lineage", "Data query", ["ANALYST", "METHODOLOGY_STEWARD"], parameters=[id_param("observationId"), id_param("revisionId")])},
}

governance = [
    ("domains", "createStatisticalDomain", "Create statistical domain", "DomainInput"),
    ("concepts", "createConcept", "Create statistical concept", "ConceptInput"),
    ("frequencies", "createFrequency", "Create frequency", "FrequencyInput"),
    ("units", "createUnitMeasure", "Create unit of measure", "UnitInput"),
    ("geographies", "createGeographicUnit", "Create geographic unit", "GeographyInput"),
    ("code-lists", "createCodeList", "Create code list and items", "CodeListInput"),
    ("classifications", "createClassification", "Create classification version and items", "ClassificationInput"),
    ("classification-mappings", "createClassificationMapping", "Create classification mapping", "ClassificationMappingInput"),
    ("statistical-operations", "createStatisticalOperation", "Create statistical operation", "StatisticalOperationInput"),
    ("methodologies", "createMethodology", "Create methodology and first version", "MethodologyInput"),
    ("data-structures", "createDataStructure", "Create multidimensional data structure", "DataStructureInput"),
    ("datasets", "createDataset", "Create dataset and first version", "DatasetInput"),
    ("indicators", "createIndicator", "Create indicator and first version", "IndicatorInput"),
]
for path, op_id, summary, schema in governance:
    paths[f"{API}/governance/{path}"] = {"post": operation(op_id, summary, "Metadata governance", ["METHODOLOGY_STEWARD"], schema)}
for path, op_id, summary, schema in [
    ("methodologies/{id}/versions", "createMethodologyVersion", "Add methodology version", "MethodologyVersionInput"),
    ("datasets/{id}/versions", "createDatasetVersion", "Add dataset version", "DatasetVersionInput"),
]:
    paths[f"{API}/governance/{path}"] = {"post": operation(op_id, summary, "Metadata governance", ["METHODOLOGY_STEWARD"], schema, [id_param()])}
for path, op_id in [("methodology-versions/{id}/transitions", "transitionMethodologyVersion"), ("dataset-versions/{id}/transitions", "transitionDatasetVersion")]:
    paths[f"{API}/governance/{path}"] = {"post": operation(op_id, "Apply an allowed version state transition", "Metadata governance", ["METHODOLOGY_STEWARD"], "VersionTransitionInput", [id_param()])}

quality = [
    ("dimensions", "createQualityDimension", "Create quality dimension", "QualityDimensionInput"),
    ("rules", "createQualityRule", "Create executable quality rule", "QualityRuleInput"),
    ("lineage-relations", "createLineageRelation", "Create lineage relation", "LineageRelationInput"),
    ("indicator-relations", "createIndicatorRelation", "Create indicator relation", "IndicatorRelationInput"),
    ("series-breaks", "createSeriesBreak", "Register comparability break", "SeriesBreakInput"),
]
for path, op_id, summary, schema in quality:
    paths[f"{API}/quality/{path}"] = {"post": operation(op_id, summary, "Quality and lineage", ["METHODOLOGY_STEWARD"], schema)}
paths[f"{API}/quality/issues"] = {"get": operation("listDataIssues", "List quality issues", "Quality and lineage", ["ANALYST", "METHODOLOGY_STEWARD", "DATA_OFFICER"], parameters=[
    {"name": "status", "in": "query", "schema": {"type": "string"}},
    {"name": "severity", "in": "query", "schema": {"type": "string"}},
    *page_params[:2],
])}
paths[f"{API}/quality/issues/{{id}}/transitions"] = {"post": operation("transitionDataIssue", "Apply issue workflow transition", "Quality and lineage", ["METHODOLOGY_STEWARD", "DATA_OFFICER"], "IssueTransitionInput", [id_param()])}

# --- Intelligence layer -----------------------------------------------------
CLAIM_TYPE = {"type": "string", "enum": [
    "FACT", "INDICATOR_READING", "ESTIMATE", "OPINION", "FORECAST", "AI_INFERENCE",
    "RISK", "OPPORTUNITY", "THREAT", "TREND", "RECOMMENDATION",
]}
CONFIDENCE_LEVEL = {"type": "string", "enum": ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"]}

schemas["AgentRegistrationInput"] = obj({
    "code": {"type": "string", "maxLength": 80},
    "name": {"type": "string", "maxLength": 250},
    "agentType": {"type": "string", "enum": [
        "EXCHANGE_RATE", "SOVEREIGN_DEBT", "SECTOR", "SOCIOECONOMIC", "SENTIMENT",
        "UNCERTAINTY", "CORPORATE", "POLITICAL", "SECURITIES_MARKET",
        "FINANCIAL_SYSTEM", "EXTERNAL_SECTOR",
    ]},
    "provider": {"type": "string", "maxLength": 80},
    "modelIdentifier": {"type": "string", "maxLength": 120},
    "specialty": {"type": "string", "maxLength": 120},
    "promptVersion": {"type": "string", "maxLength": 40},
    "schemaVersion": {"type": "string", "maxLength": 40},
    "organizationId": UUID,
    "configuration": {"type": "object", "additionalProperties": True},
}, ("code", "name", "agentType", "provider", "modelIdentifier", "promptVersion", "schemaVersion", "organizationId"))

schemas["AgentRunInput"] = obj({
    "agentCode": {"type": "string", "maxLength": 80},
    "triggerType": {"type": "string", "enum": ["SCHEDULED", "MANUAL", "RETRY", "BACKFILL"]},
    "attemptNo": {"type": "integer", "minimum": 1, "maximum": 50, "default": 1},
    "promptVersion": {"type": "string", "maxLength": 40},
    "schemaVersion": {"type": "string", "maxLength": 40},
}, ("agentCode", "triggerType", "promptVersion", "schemaVersion"))

schemas["ClaimEvidenceInput"] = obj({
    "sourceArtifactId": UUID,
    "excerpt": {"type": "string", "minLength": 20, "maxLength": 4000},
    "locator": {"type": "string", "maxLength": 2000},
    "retrievedAt": DATETIME,
}, ("sourceArtifactId", "excerpt", "retrievedAt"))

schemas["FactClaimInput"] = obj({
    "claimType": CLAIM_TYPE,
    "assertion": {"type": "string", "minLength": 20, "maxLength": 4000},
    "eventDate": DATE,
    "publishedAt": DATETIME,
    "timeHorizon": {"type": "string", "enum": ["IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "LONG_TERM", "STRUCTURAL"]},
    "impactLevel": {"type": "string", "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NEGLIGIBLE"]},
    "probability": {"type": "number", "minimum": 0, "maximum": 1},
    "confidenceLevel": CONFIDENCE_LEVEL,
    "confidenceScore": {"type": "number", "minimum": 0, "maximum": 1},
    "statisticalDomainId": UUID,
    "geographicUnitId": UUID,
    "entityMentions": array({"type": "string", "maxLength": 250}, 25),
    "evidence": array(ref("ClaimEvidenceInput"), 10),
}, ("claimType", "assertion", "confidenceLevel", "evidence"))

schemas["AgentSubmissionInput"] = obj({
    "submissionCode": {"type": "string", "maxLength": 80},
    "items": array(obj({
        "rawPayload": {"type": "object", "additionalProperties": True},
        "claim": ref("FactClaimInput"),
    }, ("rawPayload", "claim")), 200),
}, ("submissionCode", "items"))

schemas["AgentRunCompletionInput"] = obj({
    "status": {"type": "string", "enum": ["SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]},
    "sourcesConsulted": {"type": "integer", "minimum": 0},
    "warningCount": {"type": "integer", "minimum": 0},
    "estimatedCostUsd": {"type": "number", "minimum": 0},
    "errorSummary": {"type": "string", "maxLength": 2000},
    "checkpoint": {"type": "object", "additionalProperties": True},
}, ("status",))

schemas["DailyAnalysisInput"] = obj({
    "agent": ref("AgentRunInput"),
    "submission": ref("AgentSubmissionInput"),
    "completion": ref("AgentRunCompletionInput"),
}, ("agent", "submission", "completion"))

schemas["ReviewDecisionInput"] = obj({
    "decision": {"type": "string", "enum": ["APPROVED", "REJECTED", "ESCALATED"]},
    "rationale": {"type": "string", "minLength": 10, "maxLength": 2000},
}, ("decision", "rationale"))

schemas["ContradictionResolutionInput"] = obj({
    "resolution": {"type": "string", "enum": ["RESOLVED", "ACCEPTED_DIVERGENCE", "DISMISSED"]},
    "rationale": {"type": "string", "minLength": 10, "maxLength": 2000},
    "selectedReference": {"type": "string", "maxLength": 80},
}, ("resolution", "rationale"))

schemas["ClaimQueryInput"] = obj({
    "claimType": CLAIM_TYPE,
    "statisticalDomainId": UUID,
    "geographicUnitId": UUID,
    "economicEntityId": UUID,
    "status": {"type": "string", "enum": ["PUBLISHED", "PENDING_REVIEW", "REJECTED", "SUPERSEDED"], "default": "PUBLISHED"},
    "page": {"type": "integer", "minimum": 1, "default": 1},
    "pageSize": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50},
})

schemas["SweepAbandonedInput"] = obj({
    "olderThanMinutes": {"type": "integer", "minimum": 5, "maximum": 10080, "default": 60},
})

paths[f"{API}/intelligence/agents"] = {"post": operation(
    "registerAgent", "Register an autonomous collector", "Agent intelligence",
    ["METHODOLOGY_STEWARD"], "AgentRegistrationInput")}
paths[f"{API}/intelligence/agent-runs"] = {"post": operation(
    "openAgentRun", "Open an agent execution", "Agent intelligence",
    ["INGESTION_AGENT"], "AgentRunInput")}
paths[f"{API}/intelligence/agent-runs/{{id}}"] = {"get": operation(
    "getAgentRun", "Get agent execution status", "Agent intelligence",
    ["INGESTION_AGENT", "ANALYST", "METHODOLOGY_STEWARD"], parameters=[id_param()])}
paths[f"{API}/intelligence/agent-runs/{{id}}/submissions"] = {"post": operation(
    "submitAgentObservations", "Submit up to 200 collected items", "Agent intelligence",
    ["INGESTION_AGENT"], "AgentSubmissionInput", [id_param()])}
paths[f"{API}/intelligence/agent-runs/{{id}}/completion"] = {"post": operation(
    "completeAgentRun", "Close an agent execution", "Agent intelligence",
    ["INGESTION_AGENT"], "AgentRunCompletionInput", [id_param()])}
paths[f"{API}/intelligence/daily-analysis"] = {"post": operation(
    "submitDailyAnalysis", "Open a run, submit the daily claims and close the run in one call",
    "Agent intelligence", ["INGESTION_AGENT"], "DailyAnalysisInput")}
paths[f"{API}/intelligence/dead-letters"] = {"get": operation(
    "listDeadLetters", "List items that exhausted their reprocessing attempts", "Agent intelligence",
    ["METHODOLOGY_STEWARD", "DATA_REVIEWER"],
    parameters=[{"name": "agentRunId", "in": "query", "schema": UUID}])}
paths[f"{API}/intelligence/raw-observations/{{id}}/reprocessing"] = {"post": operation(
    "reprocessRawObservation", "Requeue a rejected or quarantined item", "Agent intelligence",
    ["METHODOLOGY_STEWARD", "DATA_REVIEWER"], parameters=[id_param("rawObservationId")])}
paths[f"{API}/intelligence/raw-observations/sweep"] = {"post": operation(
    "sweepAbandonedRawObservations", "Dead-letter items abandoned in flight after a restart",
    "Agent intelligence", ["METHODOLOGY_STEWARD"], "SweepAbandonedInput")}
paths[f"{API}/intelligence/claims/search"] = {"post": operation(
    "searchClaims", "Search claims with evidence", "Claim review",
    ["ANALYST", "METHODOLOGY_STEWARD", "DATA_REVIEWER"], "ClaimQueryInput")}
paths[f"{API}/intelligence/review-tasks/{{id}}/decisions"] = {"post": operation(
    "decideReviewTask", "Approve or reject a pending claim", "Claim review",
    ["DATA_REVIEWER", "METHODOLOGY_STEWARD"], "ReviewDecisionInput", [id_param()])}
paths[f"{API}/intelligence/contradictions/{{id}}/resolutions"] = {"post": operation(
    "resolveContradiction", "Close a contradiction with a justification", "Claim review",
    ["DATA_REVIEWER", "METHODOLOGY_STEWARD"], "ContradictionResolutionInput", [id_param()])}

spec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Observatorio Económico Core API",
        "version": "1.0.0",
        "description": "Core estadístico para procedencia, metadatos, ingestión, revisión, consulta histórica, calidad y linaje.",
    },
    "servers": [{"url": "http://localhost:8080", "description": "Local via NGINX"}],
    "tags": [{"name": name} for name in ["Operations", "Provenance", "Metadata governance", "Data ingestion", "Data query", "Quality and lineage", "Agent intelligence", "Claim review"]],
    "paths": paths,
    "components": {
        "securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
        "schemas": schemas,
    },
}

output = ROOT / "docs/endpoints/openapi.yaml"
output.parent.mkdir(parents=True, exist_ok=True)
with open(output, 'w', encoding='utf-8', newline=chr(10)) as handle:
    handle.write(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True))
print(output)
