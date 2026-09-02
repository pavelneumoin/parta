-- Versioned ink metadata keeps legacy strokes stable while handwriting v2
-- uses normalized page coordinates and brush-specific rendering.
ALTER TABLE "Stroke" ADD COLUMN "coordinateSpace" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Stroke" ADD COLUMN "brushKind" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Stroke" ADD COLUMN "renderVersion" INTEGER NOT NULL DEFAULT 1;
