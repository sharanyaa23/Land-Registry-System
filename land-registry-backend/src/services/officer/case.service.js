const OfficerCase = require('../../models/OfficerCase.model');
const paginate    = require('../../utils/paginateQuery');
const logger      = require('../../utils/logger');

/**
 * Get all queued cases for officer dashboard.
 */
exports.getQueuedCases = async (query = {}) => {
  const filter = { status: 'queued' };
  const dbQuery = OfficerCase.find(filter)
    .populate('land', 'location area status blockchain')
    .populate('transferRequest')
    .sort({ createdAt: 1 }); // oldest first

  return paginate(dbQuery, query);
};

/**
 * Get a single case by id.
 */
exports.getCaseById = async (caseId) => {
  return OfficerCase.findById(caseId)
    .populate('land', 'location area status documents blockchain listingPrice')
    .populate({
      path: 'transferRequest',
      populate: [
        { path: 'buyer',  select: 'walletAddress profile.fullName' },
        { path: 'seller', select: 'walletAddress profile.fullName' }
      ]
    });
};

/**
 * Mark case as in_review when officer opens it.
 */
exports.startReview = async (caseId, officerId) => {
  const officerCase = await OfficerCase.findByIdAndUpdate(
    caseId,
    { $set: { status: 'in_review', reviewedBy: officerId, reviewStartedAt: new Date() } },
    { new: true }
  );
  logger.info('Officer started review', { caseId, officerId });
  return officerCase;
};