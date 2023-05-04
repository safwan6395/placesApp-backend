const fs = require("fs");

const { validationResult } = require("express-validator");
const mongoose = require("mongoose");

const HttpError = require("../models/http-error");
const getCoordsForAddress = require("../utils/location");
const Place = require("../models/place");
const User = require("../models/user");

exports.getPlaceById = async (req, res, next) => {
  const { pid } = req.params;

  let place;
  try {
    place = await Place.findById(pid);
  } catch (error) {
    return next(
      new HttpError("Something went wrong, could not find the place", 500)
    );
  }

  if (!place) {
    return next(
      new HttpError("couldnt find the place with the provided place id.", 404)
    );
  }
  res.json({ place: place.toObject({ getters: true }) });
};

exports.getPlacesByUserId = async (req, res, next) => {
  const { uid } = req.params;

  let userWithPlaces;
  try {
    userWithPlaces = await User.findById(uid).populate("places");
  } catch (error) {
    return next(new HttpError("Something went wrong, please try again", 500));
  }

  if (!userWithPlaces || userWithPlaces.places.length === 0) {
    return next(
      new HttpError("Could not find any places with the provided user id.", 404)
    );
  }
  res.json({
    places: userWithPlaces.places.map((place) =>
      place.toObject({ getters: true })
    ),
  });
};

exports.createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid input recieved, Please check your data.", 422)
    );
  }

  const { title, description, address } = req.body;
  const coordinates = await getCoordsForAddress();
  const createdPlace = new Place({
    title,
    description,
    address,
    creator: req.userData.userId,
    location: coordinates,
    image: req.file.path,
  });

  let user;
  try {
    user = await User.findById(req.userData.userId);
  } catch (error) {
    return next(
      new HttpError("Could nooot create the place, please try again", 500)
    );
  }

  if (!user)
    return next(
      new HttpError("Could notttt find user for the provided id", 404)
    );

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdPlace.save({ session: sess });
    user.places.push(createdPlace);
    await user.save({ session: sess });
    await sess.commitTransaction();
  } catch (error) {
    return next(
      new HttpError("Could nott create the place, please try again", 500)
    );
  }

  try {
    await createdPlace.save();
  } catch (err) {
    return next(
      new HttpError("could not create the place, please try again", 500)
    );
  }

  res.status(201).json({ place: createdPlace });
};

exports.updatePlaceById = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid input recieved, Please check your data.", 422)
    );
  }

  const { pid } = req.params;
  const { title, description } = req.body;

  let place;
  try {
    place = await Place.findById(pid);
  } catch (err) {
    return next(
      new HttpError("Something went wrong, Could not update the place", 500)
    );
  }

  if (place.creator.toString() !== req.userData.userId) {
    return next(new HttpError("You are not allowed to edit this place", 401));
  }

  place.title = title;
  place.description = description;

  try {
    await place.save();
  } catch (error) {
    return next(
      new HttpError("Something went wrong, Could not update the place", 500)
    );
  }
  res.status(200).json({ place: place.toObject({ getters: true }) });
};

exports.deletePlaceById = async (req, res, next) => {
  const { pid } = req.params;

  let place;
  try {
    place = await Place.findById(pid).populate("creator");
  } catch (error) {
    return next(
      new HttpError("Something went wrong, Could not delete the place", 500)
    );
  }

  if (!place)
    return next(new HttpError("could not find the place with the provided id"));

  if (place.creator.id !== req.userData.userId)
    return next(new HttpError("You are not allowed to delete this place", 401));

  const imagePath = place.image;

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await place.deleteOne({ session: sess });
    place.creator.places.pull(place);
    await place.creator.save({ session: sess });
    await sess.commitTransaction();
  } catch (error) {
    return next(
      new HttpError(
        "Something went wrong. could not delete the place, pleasetry again",
        500
      )
    );
  }

  fs.unlink(imagePath, (err) => console.log(err));

  res.status(200).json({ message: "The place is deleted" });
};
