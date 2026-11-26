/* Orthographic triangle rasterizer for the static posters and disco turntable.
 */
#include <math.h>
#include <stdint.h>

void raster(int width, int height, uint8_t *bgra, float *depth, int count, float sheet_detail,
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
      const int *tile = texture[i] < 0 ? 0 : tiles + texture[i] * 6;
      int tw = tile ? tile[1] : 0, th = tile ? tile[2] : 0, offset = tile ? tile[0] : 0;
      if (tile && tile[4]) {
        // Select a filtered repeat from the projected UV footprint, including edge-on sheets.
        float du1 = (coords[2]-coords[0])*tw, du2 = (coords[4]-coords[0])*tw;
        float dv1 = (coords[3]-coords[1])*th, dv2 = (coords[5]-coords[1])*th;
        float rx = hypotf(du1*(cy-ay)-du2*(by-ay), dv1*(cy-ay)-dv2*(by-ay)) / fabsf(det);
        float ry = hypotf(du2*(bx-ax)-du1*(cx-ax), dv2*(bx-ax)-dv1*(cx-ax)) / fabsf(det);
        int lod = sheet_detail == 0 ? tile[4] : fminf(tile[4], roundf(log2f(fmaxf(1, fmaxf(rx, ry)))));
        for (int level = 0; level < lod; ++level) {
          offset += tw*th*tile[3];
          tw /= 2;
          th /= 2;
        }
      }
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
            if (tile[4]) { u -= floorf(u); v -= floorf(v); }
            int tx = fminf(tw - 1, fmaxf(0, u * tw));
            int ty = fminf(th - 1, fmaxf(0, v * th));
            sample = pixels + offset + tile[3] * (ty * tw + tx);
            if (tile[4] && sample[3] < tile[5] * sheet_detail) continue;
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
