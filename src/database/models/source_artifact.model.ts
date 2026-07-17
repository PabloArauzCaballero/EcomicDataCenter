import { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';
import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'source_artifact', schema: 'provenance', timestamps: false, underscored: true })
export class SourceArtifactModel extends Model<
  InferAttributes<SourceArtifactModel>,
  InferCreationAttributes<SourceArtifactModel>
> {
  @Column({ field: 'source_artifact_id', type: DataType.UUID, allowNull: false, primaryKey: true, defaultValue: DataType.UUIDV4 })
  declare sourceArtifactId: CreationOptional<string>;

  @Column({ field: 'source_id', type: DataType.UUID, allowNull: false })
  declare sourceId: string;

  @Column({ field: 'artifact_type', type: DataType.STRING(40), allowNull: false })
  declare artifactType: string;

  @Column({ field: 'original_filename', type: DataType.STRING(255), allowNull: true })
  declare originalFilename: string | null;

  @Column({ field: 'original_uri', type: DataType.TEXT, allowNull: true })
  declare originalUri: string | null;

  @Column({ field: 'storage_uri', type: DataType.TEXT, allowNull: false })
  declare storageUri: string;

  @Column({ field: 'mime_type', type: DataType.STRING(120), allowNull: true })
  declare mimeType: string | null;

  @Column({ field: 'sha256', type: DataType.CHAR(64), allowNull: false, unique: true })
  declare sha256: string;

  @Column({ field: 'publication_date', type: DataType.DATEONLY, allowNull: true })
  declare publicationDate: string | null;

  @Column({ field: 'retrieved_at', type: DataType.DATE, allowNull: false })
  declare retrievedAt: Date;

  @Column({ field: 'file_size_bytes', type: DataType.BIGINT, allowNull: true })
  declare fileSizeBytes: string | null;

  @Column({ field: 'metadata_json', type: DataType.JSONB, allowNull: false })
  declare metadataJson: Record<string, unknown>;

}
