import { Inject, Injectable } from '@nestjs/common';
import { QueryTypes, type Sequelize } from 'sequelize';
import { ConflictError, NotFoundError } from '../../common/errors/application.error';
import { READER_DATABASE, WRITER_DATABASE } from '../../database/database.tokens';
import { OrganizationModel, SourceArtifactModel, SourceModel } from '../../database/models';
import type {
  CreateOrganizationInput,
  CreateSourceArtifactInput,
  CreateSourceInput,
  ListProvenanceInput,
} from './provenance.schemas';

@Injectable()
export class ProvenanceService {
  constructor(
    @Inject(WRITER_DATABASE) private readonly writer: Sequelize,
    @Inject(READER_DATABASE) private readonly reader: Sequelize,
  ) {}

  async createOrganization(input: CreateOrganizationInput) {
    const duplicate = await OrganizationModel.findOne({ where: { code: input.code } });
    if (duplicate)
      throw new ConflictError('organization code already exists', { code: input.code });
    if (input.parentOrganizationId) {
      const parent = await OrganizationModel.findByPk(input.parentOrganizationId);
      if (!parent) throw new NotFoundError('organization', input.parentOrganizationId);
    }
    return OrganizationModel.create({
      parentOrganizationId: input.parentOrganizationId ?? null,
      code: input.code,
      legalName: input.legalName,
      shortName: input.shortName,
      organizationType: input.organizationType,
      countryCode: input.countryCode,
      officialStatisticsProducer: input.officialStatisticsProducer,
      isActive: input.isActive,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
    });
  }

  async createSource(input: CreateSourceInput) {
    const [organization, duplicate] = await Promise.all([
      OrganizationModel.findByPk(input.organizationId),
      SourceModel.findOne({ where: { code: input.code } }),
    ]);
    if (!organization) throw new NotFoundError('organization', input.organizationId);
    if (duplicate) throw new ConflictError('source code already exists', { code: input.code });
    return SourceModel.create({
      organizationId: input.organizationId,
      frequencyId: input.frequencyId ?? null,
      code: input.code,
      name: input.name,
      sourceType: input.sourceType,
      accessMethod: input.accessMethod,
      officialUri: input.officialUri ?? null,
      licenseCode: input.licenseCode ?? null,
      activeFrom: input.activeFrom ?? null,
      activeTo: input.activeTo ?? null,
      isActive: input.isActive,
    });
  }

  async registerArtifact(input: CreateSourceArtifactInput) {
    const [source, duplicate] = await Promise.all([
      SourceModel.findByPk(input.sourceId),
      SourceArtifactModel.findOne({ where: { sha256: input.sha256 } }),
    ]);
    if (!source) throw new NotFoundError('source', input.sourceId);
    if (duplicate) return { status: 'EXISTING', artifact: duplicate };
    const artifact = await SourceArtifactModel.create({
      sourceId: input.sourceId,
      artifactType: input.artifactType,
      originalFilename: input.originalFilename ?? null,
      originalUri: input.originalUri ?? null,
      storageUri: input.storageUri,
      mimeType: input.mimeType ?? null,
      sha256: input.sha256,
      publicationDate: input.publicationDate ?? null,
      retrievedAt: new Date(input.retrievedAt),
      fileSizeBytes: input.fileSizeBytes ?? null,
      metadataJson: input.metadataJson,
    });
    return { status: 'CREATED', artifact };
  }

  async listOrganizations(input: ListProvenanceInput) {
    const replacements = {
      search: input.search ? `%${input.search}%` : null,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
    const rows = await this.reader.query<Record<string, unknown>>(
      `SELECT organization_id, parent_organization_id, code, legal_name, short_name,
              organization_type, country_code, official_statistics_producer, is_active,
              valid_from, valid_to, COUNT(*) OVER() AS total_count
       FROM provenance.organization
       WHERE (:search::text IS NULL OR code ILIKE :search OR legal_name ILIKE :search)
       ORDER BY code
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );
    return this.page(rows, Number(rows[0]?.total_count ?? 0), input);
  }

  async listSources(input: ListProvenanceInput) {
    const replacements = {
      search: input.search ? `%${input.search}%` : null,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    };
    const rows = await this.reader.query<Record<string, unknown>>(
      `SELECT source.*, organization.short_name AS organization_short_name,
              COUNT(*) OVER() AS total_count
       FROM provenance.source source
       JOIN provenance.organization organization USING (organization_id)
       WHERE (:search::text IS NULL OR source.code ILIKE :search OR source.name ILIKE :search)
       ORDER BY source.code
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    );
    return this.page(rows, Number(rows[0]?.total_count ?? 0), input);
  }

  async getArtifact(id: string) {
    const rows = await this.reader.query<Record<string, unknown>>(
      `SELECT source_artifact_id, source_id, artifact_type, original_filename, original_uri,
              storage_uri, mime_type, sha256, publication_date, retrieved_at,
              file_size_bytes, metadata_json
       FROM provenance.source_artifact
       WHERE source_artifact_id = :id`,
      { replacements: { id }, type: QueryTypes.SELECT },
    );
    if (!rows[0]) throw new NotFoundError('source_artifact', id);
    return rows[0];
  }

  private page<T>(rows: readonly T[], total: number, input: ListProvenanceInput) {
    return {
      data: rows,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }
}
