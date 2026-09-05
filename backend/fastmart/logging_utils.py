import logging

# Get logger for fastmart app
logger = logging.getLogger('fastmart')


def log_info(message, **kwargs):
    """Log info level message"""
    logger.info(message, extra=kwargs)


def log_error(message, exc_info=False, **kwargs):
    """Log error level message"""
    logger.error(message, exc_info=exc_info, extra=kwargs)


def log_warning(message, **kwargs):
    """Log warning level message"""
    logger.warning(message, extra=kwargs)


def log_debug(message, **kwargs):
    """Log debug level message"""
    logger.debug(message, extra=kwargs)
