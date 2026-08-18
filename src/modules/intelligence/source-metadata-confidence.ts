export type UnverifiedSourceMetadataReason = 'UNVERIFIED_PUBLICATION_DATE' | 'UNVERIFIED_PUBLISHER';

export interface SourceMetadataVerification {
  publicationDateVerified: boolean;
  publisherVerified: boolean;
}

/** Ensures AI-only source metadata cannot satisfy automatic-publication confidence. */
export function calibrateConfidenceForSourceMetadata(
  confidenceLevel: string,
  confidenceScore: number | null,
  verification: SourceMetadataVerification,
): {
  confidenceLevel: string;
  confidenceScore: number | null;
  adjusted: boolean;
  reasons: UnverifiedSourceMetadataReason[];
} {
  const reasons: UnverifiedSourceMetadataReason[] = [];
  if (!verification.publicationDateVerified) reasons.push('UNVERIFIED_PUBLICATION_DATE');
  if (!verification.publisherVerified) reasons.push('UNVERIFIED_PUBLISHER');
  if (!reasons.length) {
    return { confidenceLevel, confidenceScore, adjusted: false, reasons };
  }
  return {
    confidenceLevel: 'LOW',
    confidenceScore: confidenceScore === null ? null : Math.min(confidenceScore, 0.49),
    adjusted: confidenceLevel !== 'LOW' || (confidenceScore !== null && confidenceScore > 0.49),
    reasons,
  };
}
