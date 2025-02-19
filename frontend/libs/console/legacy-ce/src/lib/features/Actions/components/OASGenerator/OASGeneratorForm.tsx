import React, { ReactNode } from 'react';
import YAML from 'js-yaml';
import { CardedTable } from '../../../../new-components/CardedTable';
import { DropdownButton } from '../../../../new-components/DropdownButton';
import { CodeEditorField, InputField } from '../../../../new-components/Form';
import { FaExclamationTriangle, FaFilter, FaSearch } from 'react-icons/fa';
import { trackCustomEvent } from '../../../Analytics';
import { useDebouncedEffect } from '../../../../hooks/useDebounceEffect';
import { Badge, BadgeColor } from '../../../../new-components/Badge';
import { Oas3 } from 'openapi-to-graphql';
import { useIsUnmounted } from '../../../../components/Services/Data/Common/tsUtils';
import { useFormContext } from 'react-hook-form';
import { useMetadata } from '../../../MetadataAPI';
import { hasuraToast } from '../../../../new-components/Toasts';
import { OasGeneratorActions } from './OASGeneratorActions';
import { GeneratedAction, Operation } from '../OASGenerator/types';

import { generateAction, getOperations } from '../OASGenerator/utils';
import { UploadFile } from './UploadFile';

const fillToTenRows = (data: ReactNode[][]) => {
  const rowsToFill = 10 - data.length;
  for (let i = 0; i < rowsToFill; i++) {
    data.push([<div className="h-5" />, '', '']);
  }
  return data;
};
const badgeColors: Record<string, BadgeColor> = {
  GET: 'green',
  POST: 'blue',
  PUT: 'yellow',
  DELETE: 'red',
  PATCH: 'purple',
};

const editorOptions = {
  minLines: 25,
  maxLines: 25,
  showLineNumbers: true,
  useSoftTabs: true,
  showPrintMargin: false,
  showGutter: true,
  wrap: true,
};

interface OasGeneratorFormProps {
  onGenerate: (action: GeneratedAction) => void;
  onDelete: (actionName: string) => void;
  disabled?: boolean;
  saveOas?: (oas: string) => void;
}

export const OasGeneratorForm = (props: OasGeneratorFormProps) => {
  const { onGenerate, onDelete, disabled } = props;
  const [operations, setOperations] = React.useState<Operation[]>([]);
  const [parsedOas, setParsedOas] = React.useState<Oas3 | null>(null);
  const [isOasTooBig, setIsOasTooBig] = React.useState(false);

  const [selectedMethods, setSelectedMethods] = React.useState<string[]>([]);

  const { data: metadata } = useMetadata();

  const isUnMounted = useIsUnmounted();

  const { watch, setValue, setError, clearErrors, trigger, formState } =
    useFormContext();
  const oas = watch('oas');

  const search = watch('search');
  const url = watch('url');

  const filteredOperations = React.useMemo(() => {
    return operations.filter(op => {
      const searchMatch =
        !search ||
        op.operationId.toLowerCase().includes(search.toLowerCase()) ||
        op.path.toLowerCase().includes(search.toLowerCase()) ||
        op.method.toLowerCase().includes(search.toLowerCase());
      const methodMatch =
        selectedMethods.length === 0 ||
        selectedMethods.includes(op.method.toUpperCase());
      return searchMatch && methodMatch;
    });
  }, [operations, search, selectedMethods]);

  const columns = operations?.length
    ? ['Method', 'Endpoint']
    : [
        <span className="normal-case font-normal tracking-normal">
          2. All available endpoints will be listed here after the import
          completes
        </span>,
      ];

  useDebouncedEffect(
    async () => {
      let localParsedOas: Oas3 | undefined;
      clearErrors();
      setOperations([]);
      if (oas && oas?.trim() !== '') {
        try {
          localParsedOas = JSON.parse(oas) as Oas3;
          // if oas is smaller that 3mb
          if (oas.length < 1024 * 1024 * 1) {
            setIsOasTooBig(false);
            if (props.saveOas) {
              props.saveOas(oas);
            }
          } else {
            setIsOasTooBig(true);
          }
        } catch (e) {
          try {
            localParsedOas = YAML.load(oas) as Oas3;
          } catch (e2) {
            setError('oas', {
              message: 'Invalid spec',
            });
            setOperations([]);
          }
        }
      }
      try {
        if (localParsedOas) {
          if (!url && localParsedOas.servers?.[0].url) {
            setValue('url', localParsedOas.servers?.[0].url);
          } else {
            trigger('url');
          }
          const ops = await getOperations(localParsedOas);
          setOperations(ops);

          // send number of operations and file length

          const size = oas?.length || 0;
          const numberOfOperations = ops?.length || 0;

          trackCustomEvent(
            {
              location: 'Import OAS Modal',
              action: 'change',
              object: 'specification',
            },
            {
              data: {
                size,
                numberOfOperations: numberOfOperations.toString(),
              },
            }
          );
        }
      } catch (e) {
        setError('oas', {
          message: `Invalid spec: ${(e as Error).message}`,
        });
      }

      setParsedOas(localParsedOas ?? null);
    },
    400,
    [oas, clearErrors, setError, setValue, url]
  );

  const createAction = async (operation: string) => {
    if (parsedOas && operation) {
      try {
        const generatedAction = await generateAction(parsedOas, operation);
        if (!isUnMounted()) {
          await trigger('url');
          if (formState.isValid) {
            onGenerate({ ...generatedAction, baseUrl: url });
            trackCustomEvent(
              {
                location: 'Import OAS Modal',
                action: 'generate',
                object: 'stats',
              },
              {
                data: {
                  size: JSON.stringify(oas?.length || 0),
                  numberOfOperations: JSON.stringify(operations?.length || 0),
                },
              }
            );
          } else {
            hasuraToast({
              type: 'error',
              title: 'Failed to generate action',
              message: 'Please fill in all the required fields',
            });
          }
        }
      } catch (e) {
        setError('operation', {
          message: `Failed to generate action: ${(e as Error).message}`,
        });
        trackCustomEvent({
          location: 'Import OAS Modal',
          action: 'generate',
          object: 'error',
        });
        // send notification
        hasuraToast({
          type: 'error',
          title: 'Failed to generate action',
          message: (e as Error).message,
        });
        console.error(e);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const reader = new FileReader();
      reader.onload = loadEvent => {
        if (loadEvent.target) {
          // set isOasTooBig to true if the oas is larger than 512kb
          setValue('oas', loadEvent.target.result);
        }
      };
      // set error
      reader.onerror = () => {
        setError('oas', {
          message: 'Invalid spec',
        });
      };

      reader.readAsText(files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between">
        <div>
          <UploadFile onChange={handleFileUpload} />
        </div>
        <div className="flex w-1/2 pl-[10px]">
          <InputField
            icon={<FaSearch />}
            placeholder="Available endpoints..."
            name="search"
            inputClassName="rounded-r-none"
            className="mb-0"
            noErrorPlaceholder
          />
          <DropdownButton
            options={{
              item: {
                onSelect(e) {
                  e.preventDefault();
                },
              },
            }}
            className="w-32 rounded-l-none"
            size="md"
            data-testid="dropdown-button"
            items={[
              Object.keys(badgeColors).map(method => (
                <div
                  className="py-1 w-full"
                  onClick={() => {
                    if (selectedMethods.includes(method)) {
                      setSelectedMethods(
                        selectedMethods.filter(m => m !== method)
                      );
                    } else {
                      setSelectedMethods([...selectedMethods, method]);
                    }
                  }}
                >
                  <div className="flex items-center">
                    <div className="mr-2 relative -top-1">
                      <input
                        type="checkbox"
                        className="border border-gray-300 rounded "
                        checked={selectedMethods.includes(method)}
                      />
                    </div>
                    <div>{method.toUpperCase()}</div>
                  </div>
                </div>
              )),
            ]}
          >
            <FaFilter className="mr-1 w-3 h-3" /> Method{' '}
            {selectedMethods.length > 0 && `(${selectedMethods.length})`}
          </DropdownButton>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="h-[400px] mb-4" data-testid="oas-editor">
            <CodeEditorField
              noErrorPlaceholder
              name="oas"
              placeholder="1. Paste OpenAPI spec in raw text (JSON / YAML) here"
              editorOptions={editorOptions}
              editorProps={{
                className: 'rounded`-r-none',
              }}
            />
          </div>
        </div>
        <div>
          <CardedTable
            className="h-[400px] relative"
            showActionCell={false}
            columns={[...columns]}
            data={fillToTenRows(
              filteredOperations.map(op => {
                const isActionAlreadyCreated =
                  metadata?.metadata?.actions?.some(
                    action =>
                      action.name.toLowerCase() === op.operationId.toLowerCase()
                  );
                return [
                  <Badge
                    color={badgeColors[op.method.toUpperCase()]}
                    className="text-xs inline-flex w-16 justify-center mr-2"
                  >
                    {op.method.toUpperCase()}
                  </Badge>,
                  <div>
                    <OasGeneratorActions
                      existing={isActionAlreadyCreated}
                      operation={op}
                      onCreate={() => createAction(op.operationId)}
                      onDelete={() => onDelete(op.operationId)}
                      disabled={disabled}
                    />
                  </div>,
                ];
              })
            )}
          />
        </div>
      </div>
      {isOasTooBig && (
        <div>
          <FaExclamationTriangle className="text-yellow-500" /> The spec is
          larger than 3MB. It won't be saved for future use.
        </div>
      )}
      <div>
        <div className="mt-xs">
          <h4 className="text-lg font-semibold mb-xs flex items-center mb-0">
            Base URL
          </h4>
          <InputField
            size="medium"
            placeholder="http://swagger.io/v2"
            name="url"
            inputClassName="rounded-r-none"
            className="mb-0 mt-xs"
            noErrorPlaceholder
          />
        </div>
      </div>
    </div>
  );
};
