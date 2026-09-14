// Boundary fixture: deliberately broken domain file.
// The checker MUST flag `next` here. This file is never imported by the app.
import type { Metadata } from 'next';

export const fixtureMetadata: Metadata = {
  title: 'deliberately-broken-fixture',
};
