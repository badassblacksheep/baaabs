/* Orthographic triangle rasterizer for the static posters and disco turntable.
 */
#include <math.h>
#include <stdint.h>

void raster(int width, int height, uint8_t *bgra, float *depth, int count,
            const float *points, const float *paint, const float *uv,
            const int *texture, const uint8_t *pixels, const int *tiles) {
  for (int transparent = 0; transparent < 2; transparent++) {
    for (int i = 0; i < count; i++) {
      const float *p = points + 9 * i, *color = paint + 4 * i;
      float opacity = color[3];
      if ((opacity < .99f) != transparent)
        continue;
      float ax = p[0], ay = p[1], bx = p[3], by = p[4], cx = p[6], cy = p[7];
      float det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (fabsf(det) < .005f)
        continue;
      int x0 = fmaxf(0, floorf(fminf(ax, fminf(bx, cx))));
      int y0 = fmaxf(0, floorf(fminf(ay, fminf(by, cy))));
      int x1 = fminf(width - 1, ceilf(fmaxf(ax, fmaxf(bx, cx))));
      int y1 = fminf(height - 1, ceilf(fmaxf(ay, fmaxf(by, cy))));
      const float *coords = uv + 6 * i;
      const int *tile = texture[i] < 0 ? 0 : tiles + texture[i] * 3;
      for (int y = y0; y <= y1; y++) {
        for (int x = x0; x <= x1; x++) {
          float dx = x + .5f - ax, dy = y + .5f - ay;
          float b = (dx * (cy - ay) - dy * (cx - ax)) / det;
          float c = ((bx - ax) * dy - (by - ay) * dx) / det, a = 1 - b - c;
          if (a < 0 || b < 0 || c < 0)
            continue;
          int j = y * width + x;
          float z = a * p[2] + b * p[5] + c * p[8];
          if (z <= depth[j])
            continue;
          const uint8_t *sample = 0;
          if (tile) {
            float u = a * coords[0] + b * coords[2] + c * coords[4];
            float v = a * coords[1] + b * coords[3] + c * coords[5];
            int tx = fminf(tile[1] - 1, fmaxf(0, u * tile[1]));
            int ty = fminf(tile[2] - 1, fmaxf(0, v * tile[2]));
            sample = pixels + tile[0] + 3 * (ty * tile[1] + tx);
          }
          if (!transparent)
            depth[j] = z;
          for (int channel = 0; channel < 3; channel++) {
            float src = color[channel] * (sample ? sample[channel] : 255);
            int k = j * 4 + 2 - channel;
            bgra[k] = fminf(255, opacity * src + (1 - opacity) * bgra[k]);
          }
        }
      }
    }
  }
}
