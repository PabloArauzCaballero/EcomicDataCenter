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
    "/version": {"get": operation("version", "Build name and process start time", "Operations", [], public=True)},
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


# --- Administrative portal ------------------------------------------------
#
# Every route here is default-deny and carries the same nine responses as the
# rest of the contract. The reading routes are the console; the two analytics
# intake routes are the public site reporting on itself, and they carry
# SITE_TELEMETRY so a compromised web tier cannot submit observations.

WINDOW_PARAMS = [
    {"name": "since", "in": "query", "schema": DATETIME},
    {"name": "until", "in": "query", "schema": DATETIME},
]
CURSOR_PARAMS = WINDOW_PARAMS + [
    {"name": "pageSize", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 200, "default": 50}},
    {"name": "cursor", "in": "query", "schema": {"type": "string", "maxLength": 512}},
]
ADMIN_READERS = ["ANALYST", "METHODOLOGY_STEWARD"]
SEED_READERS = ["ANALYST", "METHODOLOGY_STEWARD", "SEED_OPERATOR"]

schemas["SeedValidationInput"] = obj({
    "packageCode": {"type": "string", "pattern": "^[a-z][a-z0-9-]{1,79}$"},
}, ("packageCode",))
schemas["SeedReconciliationInput"] = obj({
    "packageCode": {"type": "string", "pattern": "^[a-z][a-z0-9-]{1,79}$"},
    "expectedVersion": {"type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$"},
    "expectedChecksum": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
    "reason": {"type": "string", "minLength": 4, "maxLength": 500},
}, ("packageCode", "expectedVersion", "expectedChecksum", "reason"))
schemas["SiteTrafficInput"] = obj({
    "events": array(obj({
        "eventId": {"type": "string", "pattern": "^[A-Za-z0-9_-]{8,64}$"},
        "occurredAt": DATETIME,
        "route": {"type": "string", "pattern": "^/[A-Za-z0-9\\-_/{}]{0,120}$"},
        "kind": {"type": "string", "enum": ["PAGE_VIEW", "DOWNLOAD_INTENT"]},
        "device": {"type": "string", "enum": ["DESKTOP", "MOBILE", "TABLET", "UNKNOWN"]},
        "referrer": {"type": "string", "enum": ["DIRECT", "SEARCH", "SOCIAL", "EXTERNAL", "INTERNAL"]},
        "visitorBucket": {"type": "string", "pattern": "^[a-f0-9]{16}$"},
        "isRobot": {"type": "boolean"},
    }, ("eventId", "occurredAt", "route", "kind", "device", "referrer", "visitorBucket", "isRobot")), 50),
}, ("events",))
schemas["ExportEventInput"] = obj({
    "requestId": {"type": "string", "pattern": "^[A-Za-z0-9._:-]{8,64}$"},
    "datasetCode": {"type": "string", "pattern": "^[a-z]{1,40}$"},
    "format": {"type": "string", "enum": ["csv", "json"]},
    "status": {"type": "string", "enum": ["REQUESTED", "GENERATED", "FAILED"]},
    "filters": {"type": "object", "additionalProperties": {"type": "string", "maxLength": 120}},
    "rowCount": {"type": "integer", "minimum": 0},
    "byteCount": {"type": "integer", "minimum": 0},
    "durationMs": {"type": "integer", "minimum": 0},
    "truncated": {"type": "boolean"},
    "errorCode": {"type": "string", "pattern": "^[A-Z_]{1,60}$"},
}, ("requestId", "datasetCode", "format", "status"))

paths[f"{API}/admin/overview"] = {"get": operation(
    "getAdminOverview", "Operational summary with coverage and freshness", "Administration",
    ADMIN_READERS)}
paths[f"{API}/admin/health/summary"] = {"get": operation(
    "getAdminHealthSummary", "Availability evidence kept apart by kind", "Administration",
    ADMIN_READERS)}
paths[f"{API}/admin/audit/events"] = {"get": operation(
    "listAdminAuditEvents", "Audited actions within the scope of the caller", "Administration",
    ADMIN_READERS, parameters=CURSOR_PARAMS + [
        {"name": "entityType", "in": "query", "schema": {"type": "string", "maxLength": 60}},
        {"name": "outcome", "in": "query", "schema": {"type": "string", "enum": ["SUCCESS", "FAILURE"]}},
        {"name": "actorSubject", "in": "query", "schema": {"type": "string", "maxLength": 200}},
    ])}
paths[f"{API}/admin/metadata/{{catalog}}"] = {"get": operation(
    "getAdminMetadataCatalog", "Read one allowlisted metadata catalogue", "Administration",
    ADMIN_READERS, parameters=[{
        "name": "catalog", "in": "path", "required": True,
        "schema": {"type": "string", "enum": [
            "frequencies", "units", "geographic-units", "statistical-domains",
            "quality-dimensions", "organizations", "sources", "datasets",
            "indicators", "methodologies",
        ]},
    }])}
paths[f"{API}/admin/ingestion/sources"] = {"get": operation(
    "listAdminSources", "Sources, calendars and freshness verdicts", "Administration",
    ADMIN_READERS)}
paths[f"{API}/admin/ingestion/runs"] = {"get": operation(
    "listAdminIngestionRuns", "Collection executions, filtered and paged", "Administration",
    ADMIN_READERS, parameters=CURSOR_PARAMS + [
        {"name": "sourceCode", "in": "query", "schema": {"type": "string", "maxLength": 80}},
        {"name": "status", "in": "query", "schema": {"type": "string", "enum": [
            "RUNNING", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"]}},
        {"name": "stage", "in": "query", "schema": {"type": "string", "enum": [
            "COLLECTION", "VALIDATION", "DELIVERY", "PERSISTENCE", "REVIEW", "PUBLICATION"]}},
    ])}
paths[f"{API}/admin/ingestion/runs/{{agentRunId}}"] = {"get": operation(
    "getAdminIngestionRun", "One execution with its stages and counters", "Administration",
    ADMIN_READERS, parameters=[id_param("agentRunId")])}
paths[f"{API}/admin/quality/evaluations"] = {"get": operation(
    "listAdminQualityEvaluations", "Rule evaluations with numerator and denominator",
    "Administration", ADMIN_READERS, parameters=CURSOR_PARAMS + [
        {"name": "ruleCode", "in": "query", "schema": {"type": "string", "maxLength": 80}},
        {"name": "result", "in": "query", "schema": {"type": "string", "enum": [
            "PASS", "WARNING", "FAIL", "ERROR", "NOT_EVALUATED", "NOT_APPLICABLE"]}},
        {"name": "severity", "in": "query", "schema": {"type": "string", "enum": [
            "INFO", "WARNING", "ERROR", "CRITICAL"]}},
    ])}
paths[f"{API}/admin/quality/issues/{{dataIssueId}}"] = {"get": operation(
    "getAdminQualityIssue", "One quality issue, its evidence and its history",
    "Administration", ADMIN_READERS, parameters=[id_param("dataIssueId")])}
paths[f"{API}/admin/quality/summary"] = {"get": operation(
    "getAdminQualitySummary", "Rule coverage, blocking failures and open issues",
    "Administration", ADMIN_READERS)}
paths[f"{API}/admin/analytics/traffic"] = {
    "get": operation("getAdminTraffic", "Traffic aggregates with declared coverage",
                     "Administration", ADMIN_READERS, parameters=WINDOW_PARAMS + [
                         {"name": "granularity", "in": "query",
                          "schema": {"type": "string", "enum": ["hour", "day"], "default": "day"}},
                     ]),
    "post": operation("recordSiteTraffic", "Report page views from the public site",
                      "Administration", ["SITE_TELEMETRY"], "SiteTrafficInput"),
}
paths[f"{API}/admin/analytics/exports"] = {
    "get": operation("listAdminExports", "Export requests, generations and failures",
                     "Administration", ADMIN_READERS, parameters=CURSOR_PARAMS + [
                         {"name": "datasetCode", "in": "query", "schema": {"type": "string", "maxLength": 40}},
                         {"name": "status", "in": "query", "schema": {"type": "string", "enum": [
                             "REQUESTED", "GENERATED", "FAILED"]}},
                     ]),
    "post": operation("recordExportEvent", "Report one export stage", "Administration",
                      ["SITE_TELEMETRY"], "ExportEventInput"),
}
# Service inquiries: the public site submits with SITE_INQUIRY, which cannot
# read the inbox back. The rows hold personal data, so only the commercial
# operator reads and works them.
INQUIRY_STATUSES = ["NEW", "CONTACTED", "WON", "LOST"]
INQUIRY_READERS = ["SUBSCRIPTION_ADMIN"]
INQUIRY_EDITORS = ["SUBSCRIPTION_ADMIN"]
schemas["ServiceInquiryInput"] = obj({
    "requestId": UUID,
    "fullName": {"type": "string", "minLength": 2, "maxLength": 120},
    "email": {"type": "string", "format": "email", "maxLength": 200},
    "organization": {"type": "string", "maxLength": 160, "nullable": True},
    "phone": {"type": "string", "maxLength": 40, "nullable": True},
    "planCode": {"type": "string", "enum": ["analista", "profesional", "institucional", "a-medida"]},
    "message": {"type": "string", "minLength": 10, "maxLength": 4000},
    "sourceRoute": {"type": "string", "minLength": 1, "maxLength": 200},
}, ("requestId", "fullName", "email", "planCode", "message", "sourceRoute"))
schemas["ServiceInquiryUpdateInput"] = obj({
    "status": {"type": "string", "enum": INQUIRY_STATUSES},
    "operatorNote": {"type": "string", "maxLength": 2000, "nullable": True},
}, ("status",))
paths[f"{API}/admin/inquiries"] = {
    "get": operation("listServiceInquiries", "Service inquiries, newest first, with counts by state",
                     "Administration", INQUIRY_READERS, parameters=[
                         {"name": "status", "in": "query", "schema": {"type": "string", "enum": INQUIRY_STATUSES}},
                         {"name": "pageSize", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25}},
                         {"name": "cursor", "in": "query", "schema": {"type": "string", "maxLength": 512}},
                     ]),
    "post": operation("submitServiceInquiry", "Submit a service inquiry; answers 202, idempotent on requestId",
                      "Administration", ["SITE_INQUIRY"], "ServiceInquiryInput"),
}
paths[f"{API}/admin/inquiries/{{serviceInquiryId}}"] = {"patch": operation(
    "updateServiceInquiry", "Change the state or note of one inquiry", "Administration",
    INQUIRY_EDITORS, "ServiceInquiryUpdateInput",
    [{"name": "serviceInquiryId", "in": "path", "required": True, "schema": UUID}])}
# Subscriptions: paid plans billed by hand. The site's customer area calls the
# site routes with SITE_SUBSCRIPTIONS; the operator's console the admin routes
# with SUBSCRIPTION_ADMIN. Secrets are answered once and stored only hashed.
SUBS_TAG = "Subscriptions"
SITE_SUBS = ["SITE_SUBSCRIPTIONS"]
SUBS_ADMIN = ["SUBSCRIPTION_ADMIN"]
SUBS_PLANS = ["analista", "profesional", "institucional"]
SUBS_PERIODS = ["MONTHLY", "ANNUAL"]
SUBS_STATUSES = ["PENDING", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"]
SUBS_USAGE_KINDS = ["API", "DOWNLOAD", "CHAT", "MAP"]
SUBS_ACCOUNT_PARAM = {"name": "subscriberAccountId", "in": "path", "required": True, "schema": UUID}


def with_status(item, status, description):
    """Moves the success response of an operation to the status it really answers."""
    success = item["responses"].pop("200")
    if status == "204":
        success = {"description": description}
    item["responses"] = {status: success, **item["responses"]}
    return item


def with_responses(item, extra):
    """Adds the statuses an operation answers besides the generic ones, keyed by code."""
    for status, description in extra.items():
        schema = {"type": "object", "additionalProperties": True} if status.startswith("2") else ref("ErrorResponse")
        item["responses"][status] = response(description, schema)
    item["responses"] = dict(sorted(item["responses"].items()))
    return item


schemas["SubscriberSessionInput"] = obj({
    "email": {"type": "string", "format": "email", "maxLength": 200},
    "password": {"type": "string", "minLength": 1, "maxLength": 200},
}, ("email", "password"))
schemas["SubscriberApiKeyInput"] = obj({
    "label": {"type": "string", "minLength": 1, "maxLength": 80},
    "maxActiveKeys": {"type": "integer", "minimum": 1, "maximum": 100, "default": 1},
}, ("label",))
schemas["SubscriberPasswordInput"] = obj({
    "currentPassword": {"type": "string", "minLength": 1, "maxLength": 200},
    "newPassword": {"type": "string", "minLength": 10, "maxLength": 200},
}, ("currentPassword", "newPassword"))
schemas["SubscriberActivationInput"] = obj({
    "token": {"type": "string", "minLength": 16, "maxLength": 200},
    "password": {"type": "string", "minLength": 10, "maxLength": 200},
    "termsVersion": {"type": "string", "minLength": 1, "maxLength": 40},
}, ("token", "password", "termsVersion"))
schemas["SubscriberUsageInput"] = obj({
    "subscriberAccountId": UUID,
    "usageKind": {"type": "string", "enum": SUBS_USAGE_KINDS},
    "amount": {"type": "integer", "minimum": 1, "maximum": 100000},
}, ("subscriberAccountId", "usageKind", "amount"))
schemas["SubscriberKeyVerificationInput"] = obj({
    "keyHash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
    "usageKind": {"type": "string", "enum": ["API"], "default": "API"},
    "amount": {"type": "integer", "enum": [1], "default": 1},
}, ("keyHash",))
schemas["SubscriberAccountInput"] = obj({
    "email": {"type": "string", "format": "email", "maxLength": 200},
    "fullName": {"type": "string", "minLength": 2, "maxLength": 120},
    "organization": {"type": "string", "maxLength": 160, "nullable": True},
    "planCode": {"type": "string", "enum": SUBS_PLANS},
    "billingPeriod": {"type": "string", "enum": SUBS_PERIODS},
    "trialDays": {"type": "integer", "minimum": 0, "maximum": 30, "default": 0},
    "serviceInquiryId": {**UUID, "nullable": True},
}, ("email", "fullName", "planCode", "billingPeriod"))
schemas["SubscriberAccountUpdateInput"] = obj({
    "planCode": {"type": "string", "enum": SUBS_PLANS},
    "billingPeriod": {"type": "string", "enum": SUBS_PERIODS},
    "status": {"type": "string", "enum": SUBS_STATUSES},
    "legalName": {"type": "string", "maxLength": 200, "nullable": True},
    "taxId": {"type": "string", "maxLength": 40, "nullable": True},
    "organization": {"type": "string", "maxLength": 160, "nullable": True},
    "unlock": {"type": "boolean", "enum": [True], "description": "Clears the owner's sign-in lock and failure count."},
})
schemas["SubscriberProfileInput"] = obj({
    "organization": {"type": "string", "maxLength": 160, "nullable": True},
    "legalName": {"type": "string", "maxLength": 200, "nullable": True},
    "taxId": {"type": "string", "maxLength": 40, "nullable": True},
})
schemas["SubscriberPasswordResetInput"] = obj({
    "email": {"type": "string", "format": "email", "maxLength": 200},
}, ("email",))
schemas["SubscriberNoticeClaimInput"] = obj({
    "subscriberAccountId": UUID,
    "kind": {"type": "string", "enum": ["USAGE_80", "EXPIRY_5D", "GRACE"]},
    "periodKey": {"type": "string", "minLength": 1, "maxLength": 40,
                  "description": "YYYY-MM for USAGE_80; the paidUntil day (date or ISO instant) otherwise."},
}, ("subscriberAccountId", "kind", "periodKey"))
schemas["SubscriberMemberInput"] = obj({
    "email": {"type": "string", "format": "email", "maxLength": 200},
    "fullName": {"type": "string", "minLength": 2, "maxLength": 120},
    "maxMembers": {"type": "integer", "minimum": 0, "maximum": 100},
}, ("email", "fullName", "maxMembers"))
schemas["SubscriberPaymentInput"] = obj({
    "amountBob": {"type": "number", "exclusiveMinimum": True, "minimum": 0, "maximum": 9999999999.99},
    "coversUntil": {"type": "string", "format": "date"},
    "reference": {"type": "string", "maxLength": 200, "nullable": True},
}, ("amountBob", "coversUntil"))
schemas["SubscriberTokenInput"] = obj({
    "purpose": {"type": "string", "enum": ["ACTIVATE", "RESET"]},
}, ("purpose",))

SITE_SUBS_PATH = f"{API}/site/subscriptions"
SUBS_MEMBER_PARAM = {"name": "memberId", "in": "path", "required": True, "schema": UUID}
paths[f"{SITE_SUBS_PATH}/sessions"] = {"post": with_responses(operation(
    "openSubscriberSession", "Sign in an owner or an ACTIVE member; one generic 401 for every failure, 423 while locked after 10 consecutive failures",
    SUBS_TAG, SITE_SUBS, "SubscriberSessionInput"), {"423": "Locked; error.details.retryAfterSeconds says how long, even when the password is right"})}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}"] = {
    "get": operation("getSubscriberAccount", "Account, this month's usage and API keys",
                     SUBS_TAG, SITE_SUBS, parameters=[SUBS_ACCOUNT_PARAM]),
    "patch": with_responses(operation("updateSubscriberProfile", "Change the invoicing data; null or blank clears a field, an absent one keeps it",
                                      SUBS_TAG, SITE_SUBS, "SubscriberProfileInput", [SUBS_ACCOUNT_PARAM]), {"404": "Unknown account"}),
}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/sessions/revoke"] = {"post": with_responses(operation(
    "revokeSubscriberSessions", "End the owner's sessions by raising its sessionVersion",
    SUBS_TAG, SITE_SUBS, parameters=[SUBS_ACCOUNT_PARAM]), {"404": "Unknown account"})}
paths[f"{SITE_SUBS_PATH}/password-resets"] = {"post": with_responses(with_status(operation(
    "requestSubscriberPasswordReset", "Issue a reset token for an owner, or an ACTIVE member, of an account that is not CANCELLED; 202 with an empty data object otherwise",
    SUBS_TAG, SITE_SUBS, "SubscriberPasswordResetInput"), "201", "Token issued, answered once"), {"202": "Nobody may reset with this e-mail"})}
paths[f"{SITE_SUBS_PATH}/notices/candidates"] = {"get": operation(
    "listSubscriberNoticeCandidates", "Every account that is neither PENDING nor CANCELLED, with this month's usage and its ACTIVE members",
    SUBS_TAG, SITE_SUBS)}
paths[f"{SITE_SUBS_PATH}/notices/claim"] = {"post": with_responses(with_status(operation(
    "claimSubscriberNotice", "Claim a notice before sending it; 201 claimed:true once, 200 claimed:false after",
    SUBS_TAG, SITE_SUBS, "SubscriberNoticeClaimInput"), "201", "First claim"), {"200": "Already claimed", "404": "Unknown account"})}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/members"] = {
    "get": with_responses(operation("listSubscriberMembers", "Members of an account, oldest first",
                                    SUBS_TAG, SITE_SUBS, parameters=[SUBS_ACCOUNT_PARAM]), {"404": "Unknown account"}),
    "post": with_responses(with_status(operation("addSubscriberMember", "Invite a member and answer its activation token once; 409 when the e-mail is in use or the plan has no seat left",
                                                 SUBS_TAG, SITE_SUBS, "SubscriberMemberInput", [SUBS_ACCOUNT_PARAM]), "201", "Member added"), {"404": "Unknown account"}),
}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/members/{{memberId}}"] = {"get": with_responses(operation(
    "getSubscriberMember", "One member, with its status and sessionVersion",
    SUBS_TAG, SITE_SUBS, parameters=[SUBS_ACCOUNT_PARAM, SUBS_MEMBER_PARAM]), {"404": "Unknown member"})}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/members/{{memberId}}/remove"] = {"post": with_responses(with_status(operation(
    "removeSubscriberMember", "Remove a member and end its sessions", SUBS_TAG, SITE_SUBS,
    parameters=[SUBS_ACCOUNT_PARAM, SUBS_MEMBER_PARAM]), "204", "Member removed"), {"404": "Unknown member"})}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/members/{{memberId}}/password"] = {"post": with_responses(with_status(operation(
    "changeSubscriberMemberPassword", "Change an ACTIVE member's password; 401 when the current one is wrong",
    SUBS_TAG, SITE_SUBS, "SubscriberPasswordInput", [SUBS_ACCOUNT_PARAM, SUBS_MEMBER_PARAM]), "204", "Password changed"), {"404": "Unknown member"})}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/api-keys"] = {"post": with_status(operation(
    "createSubscriberApiKey", "Mint an API key; the full key is answered once",
    SUBS_TAG, SITE_SUBS, "SubscriberApiKeyInput", [SUBS_ACCOUNT_PARAM]), "201", "Key created")}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/api-keys/{{apiKeyId}}/revoke"] = {"post": with_status(operation(
    "revokeSubscriberApiKey", "Revoke one API key", SUBS_TAG, SITE_SUBS, parameters=[
        SUBS_ACCOUNT_PARAM, {"name": "apiKeyId", "in": "path", "required": True, "schema": UUID}]),
    "204", "Key revoked")}
paths[f"{SITE_SUBS_PATH}/accounts/{{subscriberAccountId}}/password"] = {"post": with_status(operation(
    "changeSubscriberPassword", "Change the password; 401 when the current one is wrong",
    SUBS_TAG, SITE_SUBS, "SubscriberPasswordInput", [SUBS_ACCOUNT_PARAM]), "204", "Password changed")}
paths[f"{SITE_SUBS_PATH}/activations"] = {"post": operation(
    "activateSubscriberAccount", "Spend a one-time token and set the password of the owner or member it names; 400 if the token is not valid",
    SUBS_TAG, SITE_SUBS, "SubscriberActivationInput")}
paths[f"{SITE_SUBS_PATH}/usage"] = {"post": operation(
    "recordSubscriberUsage", "Add to this month's usage counter",
    SUBS_TAG, SITE_SUBS, "SubscriberUsageInput")}
paths[f"{SITE_SUBS_PATH}/api-keys/verify"] = {"post": operation(
    "verifySubscriberApiKey", "Resolve an API key by its SHA-256 and meter the call; 404 if unknown or revoked",
    SUBS_TAG, SITE_SUBS, "SubscriberKeyVerificationInput")}

ADMIN_SUBS_PATH = f"{API}/admin/subscriptions"
paths[f"{ADMIN_SUBS_PATH}/accounts"] = {
    "get": operation("listSubscriberAccounts", "Subscribers, newest first, with this month's usage",
                     SUBS_TAG, SUBS_ADMIN, parameters=[
                         {"name": "status", "in": "query", "schema": {"type": "string", "enum": SUBS_STATUSES}},
                         {"name": "pageSize", "in": "query", "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25}},
                         {"name": "cursor", "in": "query", "schema": {"type": "string", "maxLength": 512}},
                     ]),
    "post": with_status(operation("createSubscriberAccount", "Open an account and its activation token",
                                  SUBS_TAG, SUBS_ADMIN, "SubscriberAccountInput"), "201", "Account created"),
}
paths[f"{ADMIN_SUBS_PATH}/accounts/{{subscriberAccountId}}"] = {"patch": operation(
    "updateSubscriberAccount", "Change plan, billing period, state or invoicing data; unlock: true clears the sign-in lock",
    SUBS_TAG, SUBS_ADMIN, "SubscriberAccountUpdateInput", [SUBS_ACCOUNT_PARAM])}
paths[f"{ADMIN_SUBS_PATH}/accounts/{{subscriberAccountId}}/sessions/revoke"] = {"post": with_responses(operation(
    "revokeSubscriberAccountSessions", "End the sessions of the owner and of every member",
    SUBS_TAG, SUBS_ADMIN, parameters=[SUBS_ACCOUNT_PARAM]), {"404": "Unknown account"})}
paths[f"{ADMIN_SUBS_PATH}/accounts/{{subscriberAccountId}}/members"] = {"get": with_responses(operation(
    "listSubscriberAccountMembers", "Members of an account, oldest first",
    SUBS_TAG, SUBS_ADMIN, parameters=[SUBS_ACCOUNT_PARAM]), {"404": "Unknown account"})}
paths[f"{ADMIN_SUBS_PATH}/accounts/{{subscriberAccountId}}/payments"] = {
    "get": operation("listSubscriberPayments", "Payments of one account, newest first",
                     SUBS_TAG, SUBS_ADMIN, parameters=[SUBS_ACCOUNT_PARAM]),
    "post": with_status(operation("recordSubscriberPayment", "Record a payment; the account becomes ACTIVE and paid_until moves to the end of the covered day in La Paz, never back",
                                  SUBS_TAG, SUBS_ADMIN, "SubscriberPaymentInput", [SUBS_ACCOUNT_PARAM]), "201", "Payment recorded"),
}
paths[f"{ADMIN_SUBS_PATH}/accounts/{{subscriberAccountId}}/tokens"] = {"post": with_status(operation(
    "issueSubscriberToken", "Issue a one-time activation or reset token, answered once; earlier unused ones of the same purpose stop working",
    SUBS_TAG, SUBS_ADMIN, "SubscriberTokenInput", [SUBS_ACCOUNT_PARAM]), "201", "Token issued")}
paths[f"{API}/admin/seeds/packages"] = {"get": operation(
    "listSeedPackages", "Seed manifest next to the ledger of what was applied",
    "Administration", SEED_READERS)}
paths[f"{API}/admin/seeds/runs/{{seedRunId}}"] = {"get": operation(
    "getSeedRun", "Durable state of one seed run", "Administration", SEED_READERS,
    parameters=[id_param("seedRunId")])}
paths[f"{API}/admin/seeds/validations"] = {"post": operation(
    "validateSeedPackage", "Validate a package without mutating domain data",
    "Administration", ["METHODOLOGY_STEWARD", "SEED_OPERATOR"], "SeedValidationInput")}
paths[f"{API}/admin/seeds/reconciliations"] = {"post": operation(
    "reconcileSeedPackage", "Request a reconciliation; answers 202 with a run id",
    "Administration", ["SEED_OPERATOR"], "SeedReconciliationInput")}
paths[f"{API}/quality/evaluations"] = {"post": operation(
    "evaluateCollectionQuality", "Run the declared collection rules at one cutoff",
    "Quality and lineage", ["METHODOLOGY_STEWARD"])}

spec = {
    "openapi": "3.0.3",
    "info": {
        "title": "Observatorio Económico Core API",
        "version": "1.0.0",
        "description": "Core estadístico para procedencia, metadatos, ingestión, revisión, consulta histórica, calidad y linaje.",
    },
    "servers": [{"url": "http://localhost:8080", "description": "Local via NGINX"}],
    "tags": [{"name": name} for name in ["Operations", "Provenance", "Metadata governance", "Data ingestion", "Data query", "Quality and lineage", "Agent intelligence", "Claim review", "Administration", "Subscriptions"]],
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
