-- seam_block position is file-global (render order), not per-section.
ALTER TABLE shared.seam_block DROP CONSTRAINT seam_block_file_path_section_id_position_key;
ALTER TABLE shared.seam_block ADD CONSTRAINT seam_block_file_position_key UNIQUE (file_path, position);
