sqlite3 C:\\Users\\robin\\AppData\\Roaming\\PhotoLibraryDesktop\\library.db -header -tabs "
SELECT
  id,
  width,
  height,
  ROUND(1.0 * width / height, 4) AS ar,
  CASE
    WHEN width > height THEN 2
    WHEN height > width THEN 1
    ELSE 4
  END AS flags
FROM assets;
" > layout_meta.tsv
