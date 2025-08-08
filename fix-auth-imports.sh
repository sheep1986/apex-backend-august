#!/bin/bash

# Fix auth imports in all API files
find . -name "*.ts" -type f -exec grep -l "from '../middleware/auth'" {} \; | while read file; do
    echo "Fixing: $file"
    # Replace the import statement
    sed -i '' "s/import { AuthenticatedRequest, authenticateUser } from '..\/middleware\/auth';/import { AuthenticatedRequest } from '..\/middleware\/clerk-auth';/g" "$file"
    sed -i '' "s/import { AuthenticatedRequest } from '..\/middleware\/auth';/import { AuthenticatedRequest } from '..\/middleware\/clerk-auth';/g" "$file"
    # Remove router.use(authenticateUser)
    sed -i '' "/router.use(authenticateUser);/d" "$file"
done

echo "Auth imports fixed!"