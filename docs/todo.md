# TO DO List

## Gallery

1. [x] Hover on photo
   1. If the hover is in the top right corner display, technical details of the photo, including the original file name.
   2. Anywhere else, if the photo has a caption, display that (caption is stored in the database).
2. Move over any photo will get it to move slightly (same effect used in People view)

## People

1. Manual Clustering - Allow users to manually merge clusters of faces/people. Like all manual operations, this should be done in a way that is easy to undo. The data should be stored seperately from automatically clustered data.
2. It should also be possible to remove one/more faces from automatically generated clusters.

## General UI

1. Add a Settings page. This will allow users to configure the application (i.e. settings stored in the DB) and their local app (i.e. settings stored in the app state, pesisted to local storage). Although currently both front end and core are on the same machine, this will allow for future expansion to a distributed system.

## Dashboard

1. [x] Persist the state of the 'pause all' button.

## Jobs

1. Create a new job to detect potentially sensitive content in images (specifically nudity and sexual content). This must only run on the local machine - no cloud services should be used. This can use local AI models and/or local libraries. The output should be a %age likelyhood of the image containing sensitive content. This should be stored in the database.
The sensitivity score should then be used to  drive the following:

- Low sensitivity (0-25%): photo is flagged as safe for cloud services
- Medium sensitivity (25-75%): photo is flagged as requires manual review.
- Very high sensitivity (75-100%): photo is as unsafe for cloud services
Photos flagged as unsafe or requiring review should never be sent to cloud services. Introduce a manual process for reviewing photos flagged for manual review - as per our general approach, manually entered data should be stored seperately from automatically generated data (so automatic db tables can be blown away with manual data preserved). This should be done in a way that is easy to undo. The gallerly view and single view should have the facility to mark/unmark photos as safe/unsafe/requires manual review.

1. Create a new job to get metadata for an image get_metadata_ai. This will use an AI prompt to determine:
   1. Type of image: Landscape, Large group portrait, family portrait, document, newspaper clipping, drawing, painting, selfie, gravestone.
   2. Estimated date, or date range, when the photo was taken. As accurate as possible: Decade, Year, Date, Full Date and Time. The estimate should consider:
      - content of the photo (e.g. clothing, hairstyles, technology, etc.)
      - physical artifacts (e.g. borders (e.g., Ornate, White, None), paper texture, medium)
      - chromatic analysis (e.g. sepia, color casts (e.g., Magenta shift), process ID)
      - filename (e.g. 'Robin 1960s.jpg')
      - EXIF data.
   3. Estimated location of the photo (supply default)
   4. Identify all people and pets in the photo. Use both the photo content. For each subject found:
      1. Lable - e.g. "Subject1", "Subject2", etc. This is the label that will be used to identify the subject in the photo when generating captions and other metadata. This should be unique for each subject in the photo. If subjects are manually identified or corrected later, this allows the caption to be updated without regenerating the entire caption.
      2. Bounding box (x, y, width, height) in pixels from bottom left corner
      3. Pet or person
      4. Location of the subject in the photo (e.g. 2nd from left, 3rd from right, center)
      5. Gender (male, female, other).
      6. For pets: dog, cat, bird etc.
      7. Estimated age range (e.g. 0-5, 5-10, 10-15, etc).
      8. Estimated date of birth range (based on age range and photo date range).
      9. Emotion (e.g. happy, sad, angry, surprised, etc).
      10. Eye gaze direction (e.g. looking at camera, looking left, looking right, etc).
      11. distinguishing features (e.g. glasses, beard, etc).
      12. List of suggested name + year of birth (based on csv file containing names and dates of birth, if supplied).
      13. If wearing a uniform, identify the uniform and the organisation it belongs to. (e.g. school uniform, Norwich City FC strip c.1970s, British Army WW2 Bomb disposal, etc.)
   5. A caption for the image using (e.g. "Subject1 and Subject2 eating icecream on the beach at Great Yarmouth, 1960s", "Subject1 and Subject2 at Subject3's 5th birthday party, 1960s", etc.)
   6. A list of keywords describing the image that could be used as tags for filtering.
   7. Overall Emotional impact of the photo (e.g. fun, happy, sad, poignant, excitement).
   8. Image quality score (percentage) - separate categories plus a discard flag:
      1. Technical quality (sharpness, focus, noise, etc.)
      2. Lighting quality (exposure, contrast, colour balance, etc.)
      3. Composition quality (framing, rule of thirds, leading lines, etc.)
      4. Emotional energy (lively, calm, etc).
      5. Discard (yes/no) - yes if photo is unuseable (e.g. blank, thumb over lens, etc).
   9. Recommended specific enhancements (e.g. 'remove red colour cast', 'unblur child's face', 'Recover lost shadow detail in the dark coat of Subject2' etc). These will be used in addition to the general enhancements in the enhance job.
   10. digital authenticity - Analyse the likelihood of the image being AI generated or manipulated, or digitally altered (e.g. Photoshop, etc.). Return a score (percentage) and a list of reasons.
   Notes:
   - This job should skip images flagged as sensitive. (see sensitive content for details)
   - Should use both the photo content and metadata (filename and EXIF data).
   - Add a setting to allow users to set a gemini api key for the AI model. This should be stored in the DB.
   - The implementation should create a gemini 3.1 pro prompt to request the metadata in a structured format (JSON).
   - Add a setting to allow users to upload a csv file containing names, dates of birth, date of death and gender. This file will be supplied along with the photo to the AI model to help it identify people. This file can be generated from a .ged family history tree file using the Kinship explorer utility. The utility allows the selection of a 'focus' person and organises the list in order of closeness to the focus person.
   - Need to consider how to join up between faces/people identified in this job and the faces/people identified in the face detection, recognition and clustering jobs. This is important for ensuring that the same person is identified as the same person across multiple photos.

## Filters

1. Need an AI enhanced filter option - that would allow the user to type in conversational queries that the ai would translate into a DB query. Once we have the metadata enhancements working, we will have rich data about the photos and can ask sophisticated questions.
