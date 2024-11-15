/**
 * Database helper class for Javascript
 * Order of steps: construct, join, load, union, squash, get/set, save
 * @example
	const product = new ORM('product', 'productcode', 'file:7');
	//load a single product
	//product.load('productcode = ?', ['RR013840_0001']); //old style (still works)
	product.load('productcode', 'RR013840_0001'); //new style
	console.log(product);

	//print description of product
	const description = product.get('description');
	console.log(description);

	//update selling price
	product.set('sellingprice', 99.99);
	console.log(product);

	//now save it back to db
	product.save();
	console.log(product);

	//load multiple items
	const ws_calendar = new ORM('ws_calendar', 'id', 'file:22');
	ws_calendar.load({
		where: 'status != ? and status != ? and jobcat = ? and position > ? and jobid is not null',
		params: ['Complete', 'Deleted', 'BIKE', 0],
		columns: ['jobid', 'position'],
	});
	const positions = ws_calendar.get('position'); //array
	console.log(positions);
	console.log(ws_calendar);
 * @author Shaun Henderson <kurdtpage@gmail.com>
 */
/* exported ORM */
class ORM {
	/**
	 * Creates a new ORM object
	 * @param {string} table Database table name
	 * @param {string} pk Primary key column name of table
	 * @param {string} [info] Some debugging stuff
	 */
	constructor(table, pk, info) {
		const orm = this;
		orm.development = 'localhost'; //set this as your development server PC name for debug messages
		if (location.href.includes(orm.development)) {
			orm.debug = true;
		} else {
			orm.debug = false;
		}

		if (typeof table === 'undefined' || table == null || table == '') {
			orm.table = null;
			console.error('Table is not specified');
			return null; //this is so other methods will fail
		}

		//pk is used to determine if .save() should INSERT or UPDATE
		if (typeof pk === 'undefined') {
			orm.pk = [orm.getPK(table)]; //get it from the db. This is another ajax call
		} else {
			orm.pk = [pk]; //array of string, the name of the primary key field
		}

		orm.table = [table]; //array of strings
		orm.data = []; //multi dimensional associative array
		orm.header = []; //array containing column names
		orm.widths = []; //array containing column widths (nice to have, not necessary)
		orm.sql = ''; //string containing last sql query (just for info)
		orm.error = ''; //string containing sql error info

		if (typeof info === 'undefined' || info == '' || info == null) {
			orm.info = '';
		} else {
			orm.info = info;
		}
	}

	fetchData(sql, params, lineNo) {
		const orm = this;
		return new Promise((resolve, reject) => {
			$.ajax({
				method: 'GET',
				url: 'php/orm.php',
				dataType: 'json',
				data: {
					sql: sql, // string
					params: params, // array
				}
			})
			.done(function (json) {
				if (json.success == 'Y') {
					resolve(json.data[0].column_name);
				} else {
					if (orm.debug) {
						alert(json.error);
					} else {
						console.error(json.error);
					}
					reject(new Error(json.error));
				}
			})
			.fail(function (jqXHR, textStatus, errorThrown) {
				const errorMessage = `Error: 
					Status: ${textStatus}
					Response: ${jqXHR.responseText}
					ErrorThrown: ${errorThrown}
					SQL: ${sql}
					Info: ${orm.info}
					jsFileName: 'Scripts/orm.js:${lineNo}',
					phpUrl = 'php/orm.php'`;
				orm.error = errorMessage;
				if (orm.debug) {
					alert(errorMessage);
				} else {
					console.error(errorMessage);
				}
				reject(new Error(errorMessage));
			});
		});
	}
	
	/**
	 * Gets the primary key of the table
	 * @param {string} table The name of the table
	 * @return {string} The value of the primary key
	 */
	getPK(table) {
		const orm = this;
		const sql = "SELECT column_name FROM information_schema.statistics WHERE index_name='PRIMARY' AND table_name=?";
		const params = [table];
		const pk = 'id'; //make a guess in case of failure

		fetchData(sql, params, 136)
		.then(pk => {
			console.log('Primary Key:', pk);
		})
		.catch(error => {
			console.error('Error:', error);
		});

		return pk;
	}

	/**
	 * Joins another table
	 * @example: orm.join('users', 'id', 'created_by', 'inner');
	 * @param {string} table Name of other table
	 * @param {string} left Join condition 1 (the table you're joining)
	 * @param {string} [right=left] Join condition 2 (the orginal table)
	 * @param {string} [type='inner'] The join type: inner, left, right, etc
	 * @return {boolean}
	 */
	join(table, left, right, type) {
		const orm = this;

		if (typeof table === 'undefined') {
			console.error('Table is not defined');
			return false;
		}

		if (!orm.pk.includes('.')) { //make the pk reference the original table, otherwise its ambiguous
			orm.pk = orm.table + '.' + orm.pk;
		}

		let index = orm.table.length;
		if (index > 0) {
			index--;
		}

		if (orm._empty(left) && orm._empty(right)) {
			//default values
			left = table + '.' + orm.getPK(table);
			right = orm.table[index] + '.' + orm.pk[index];
		} else {
			if (!orm._empty(left) && orm._empty(right)) {
				//right = orm.table[index] + '.' + orm.pk[index];
				right = orm.table[index] + '.' + left;
			}

			if (!left.includes('.') && left.length < 50) {
				left = table + '.' + left;
			}

			if (!right.includes('.') && right.length < 50) {
				//get original table. need to do this for multiple JOINs
				let table = orm.table[index];
				let tablearray = table.split(' ');

				right = tablearray[0] + '.' + right;
			}
		}

		if (typeof type === 'undefined') {
			type = 'INNER';
		}

		type = type.replace(' JOIN', '');

		if (type != 'LEFT' && type != 'left' &&
			type != 'INNER' && type != 'inner' &&
			type != 'OUTER' && type != 'outer' &&
			type != 'RIGHT' && type != 'right' &&
			type != 'LEFT INNER' && type != 'left inner' &&
			type != 'LEFT OUTER' && type != 'left outer' &&
			type != 'RIGHT INNER' && type != 'right inner' &&
			type != 'RIGHT OUTER' && type != 'right outer'
		) {
			console.warn('Join type "' + type + '" should be one of: inner, outer, left, right');
		}

		orm.table[index] += ' ' + type + ' JOIN ' + table + ' ON ' + left + ' = ' + right;
		//now you've joined the table, time to .load() data
		return true;
	}

	/**
	 * Loads data from the database via SELECT query
	 * Data is stored in the ORM object, use .get() to do stuff with the data
	 * If using curdate(), curtime() or now() then put that in the sql and NOT the params (clientip() and serverip() can go in the params)
	 * @example customer.load('customercode', $('#custcode').val(), 'emailinvoice');
	 * @param {string|object} where Where clause, including placeholders
	 * @param {array|string} [params] Data to replace ? placeholders
	 * @param {string|array} [columns] Optional columns to return for SELECT. Defaults to *
	 * @param {string|array} [sort] Columns to sort (order) by
	 * @param {string|array} [group] GROUP BY these columns
	 * @param {number} [limit] LIMIT to this number of rows
	 * @param {number} [tableIndex=0] orm.table is an array, this selects which one. Defaults to 0. Used with .union()
	 * @param {boolean} [async=false] Synchronous or asynchronous ajax call
	 * @return {boolean} true/false depending on success
	 */
	load(where, params, columns, sort, group, limit, tableIndex, async) {
		const orm = this;

		if (typeof where == "object" && where != null && !where.isArray) {
			params = where.params;
			columns = where.columns;
			sort = where.sort;
			group = where.group;
			limit = where.limit;
			tableIndex = where.tableIndex;
			async = where.async;
			where = where.where; //make sure this is last
		}

		if (typeof tableIndex === 'undefined') {
			tableIndex = 0;
		}

		const table = orm.table[tableIndex];
		const header = orm.header;
		let widths = orm.widths;
		let returnVal = false;

		//table validation
		if (table == null || table == '') {
			console.error('Trying to load data from an unknown table');
			return false;
		}

		{ //this is just for debugging
			const method = orm.info + '.load(';
			//where
			if (typeof where === 'string') {
				method += "'" + where + "'";
			} else if (Array.isArray(where) && where.length > 0) {
				method += '[' + where.toString() + ']';
			} else {
				//null or undefined
				method += 'null';
			}

			//params
			if (typeof params === 'string') {
				method += ", '" + params + "'";
			} else if (Array.isArray(params) && params.length > 0) {
				method += ', [';
				for (let i = 0; i < params.length; i++) {
					method += '"' + params[i] + '", ';
				}
				method = method.slice(0, -2);
				method += ']';
			} else {
				//null or undefined
				method += ', null';
			}

			//columns
			if (typeof columns === 'string') {
				method += ", '" + columns + "'";
			} else if (Array.isArray(columns) && columns.length > 0) {
				method += ', [';
				for (let i = 0; i < columns.length; i++) {
					method += '"' + columns[i] + '", ';
				}
				method = method.slice(0, -2);
				method += ']';
			} else {
				//null or undefined
				//method += ', null';
			}

			//sort
			if (typeof sort === 'string') {
				method += ", '" + sort + "'";
			} else if (Array.isArray(sort) && sort.length > 0) {
				method += ', [' + sort.toString() + ']';
			} else {
				//null or undefined
				//method += ', null';
			}

			//group
			if (typeof group === 'string') {
				method += ", '" + group + "'";
			} else if (Array.isArray(group) && group.length > 0) {
				method += ', [' + group.toString() + ']';
			} else {
				//null or undefined
				//method += ', null';
			}

			//limit
			if (typeof limit !== 'undefined') {
				method += ', ' + limit;
			}

			method += ');';
		}

		//auto complete where statement
		if (typeof where !== 'undefined' &&
			where != '' &&
			where != null &&
			!where.includes('=') &&
			!where.includes('?')
		) {
			where += ' = ?';
		}

		//convert params to array
		if (typeof params === 'string' || typeof params === 'number') {
			const params_new = [];
			params_new.push(params);
			params = params_new;
			params_new = null;
		}

		//allow 'WHERE x = null' => 'WHERE x IS NULL'
		if (
			(
				params == null ||
				params == 'null' ||
				(
					typeof params == 'object' &&
					params.length == 0
				) || (
					typeof params == 'object' &&
					params.length == 1 &&
					params[0] === ''
				)
			) &&
			typeof where !== 'undefined' &&
			where !== null &&
			where !== ''
		) {
			where = where.replace(' = ?', ' IS NULL');
			console.warn('One of the params is null. Are you sure this is right?', orm.info);
		}

		//fix up columns
		if (typeof columns == "undefined" || columns == 'null' || columns == '' || columns == null || columns == '*') {
			columns = '*';
		} else {
			//convert columns array to string
			if (Array.isArray(columns)) {
				columns = columns.toString(); //comma delimited
			}

			//add pk
			if (typeof orm.pk === 'string') {
				if (!columns.includes(orm.pk)) {
					columns = orm.pk + ', ' + columns;
				}
			} else if (typeof orm.pk === 'object' && orm.pk !== null) {
				if (!columns.includes(orm.pk[tableIndex])) {
					columns = orm.table[tableIndex] + '.' + orm.pk[tableIndex] + ', ' + columns;
				}
			}
		}

		//select, from
		let sql = 'SELECT ' + columns + ' FROM ' + table;

		//where
		if (typeof where !== 'undefined' && where != '' && where != null) {
			sql += ' WHERE ' + where;
		}

		//group by
		if (typeof group !== 'undefined' && group !== null) {
			if (Array.isArray(group)) {
				group = group.toString(); //convert array to string
			}
			sql += ' GROUP BY ' + group;
		}

		//order by
		if (typeof sort !== 'undefined' && sort !== null) {
			if (Array.isArray(sort)) {
				sort = sort.toString(); //convert array to string
			}
			sql += ' ORDER BY ' + sort;
		}

		//limit
		if (typeof limit !== 'undefined' && limit !== null) {
			sql += ' LIMIT ' + limit;
		}

		//async
		if (typeof async === 'undefined') {
			async = false;
		}

		orm.sql = orm.niceSQL(sql, params);

		$.ajax({
			method: 'GET',
			url: 'php/orm.php',
			async: async,
			dataType: 'json',
			data: {
				sql: sql, //string
				params: params, //array
			}
		})
		.done(function (json) {
			if (json.success == 'Y') {
				//got details from ajax, assign data to object
				if (json.data == null) {
					console.warn('Loaded no data');
				}

				orm.sql = json.nice_sql; //replaces clientip() with the real value

				json.data.forEach((element) => {
					orm.data.push(element); //this adds to data (allows for union)
				});

				//update header
				for (let rowIndex in orm.data) {
					let rowData = orm.data[rowIndex];
					let colNumber = 0;

					for (let colIndex in rowData) {
						if (!header.includes(colIndex)) {
							//column not found, add it
							header.push(colIndex);
							widths.push(colIndex.length);
						} else {
							//found column name, update width
							if (rowData[colIndex] == null) {
								if (widths[colNumber] < 4) {
									widths[colNumber] = 4;
								}
							} else {
								if (widths[colNumber] < rowData[colIndex].length) {
									widths[colNumber] = rowData[colIndex].length;
								}
							}
						}

						colNumber++;
					}
				}

				returnVal = true;
			} else {
				console.error(json.error);
				const errorCode = 'ORM01',
					errorMessage = 'Error ' + errorCode + ' ' + method + "\n" +
						json.error + "\n" +
						sql + "\n" +
						orm.info,
					jsFileName = 'Scripts/orm.js',
					lineNo = 476,
					phpUrl = 'php/orm.php';
				if (orm.debug) {
					alert(errorMessage + "\njsFileName:" + jsFileName + ':' + lineNo + "\nphpUrl:" + phpUrl);
				} else {
					console.log(errorCode, errorMessage, jsFileName, lineNo, phpUrl, false, sql);
				}
				console.error(errorMessage + "\njsFileName:" + jsFileName + ':' + lineNo + "\nphpUrl:" + phpUrl);
			}
		})
		.fail(function (jqXHR, textStatus, errorThrown) {
			let errorMessage = 'Unknown';
			let responseText = 'None';
			if (typeof jqXHR.responseText != 'undefined') responseText = jqXHR.responseText;
			if (responseText.includes('Column not found') && responseText.includes('Unknown column')) {
				console.error(responseText);
				if (typeof where === 'string') {
					where = where.replace(' = ?', '');
					errorMessage = 'JS: ' + method + '\nSQL: ' + orm.sql + "\nError: " + table + '.' + where +
						' does not exist ' + orm.info;
					if (orm.debug) {
						alert(errorMessage);
					} else {
						console.error(errorMessage);
					}
				} else {
					errorMessage = 'JS: ' + method + "\nSQL: " + orm.sql + '\nError: One of these columns: "' +
						where + '" does not exist in table "' + table + '" ' + orm.info;
					if (orm.debug) {
						alert(errorMessage);
					} else {
						console.error(errorMessage);
					}
				}
			} else {
				const errorCode = 'ORM02',
					jsFileName = 'Scripts/orm.js',
					lineNo = 513,
					phpUrl = 'php/orm.php';
				errorMessage = 'Error ' + errorCode + "\n\
					Status: " + textStatus + "\n\
					Response: " + responseText + "\n\
					ErrorThrown: " + errorThrown + "\n\
					SQL: " + orm.sql + "\n\
					Info: " + orm.info;
				if (orm.debug) {
					alert(errorMessage + "\njsFileName:" + jsFileName + ':' + lineNo + "\nphpUrl:" + phpUrl);
				} else {
					console.log(errorCode, errorMessage, jsFileName, lineNo, phpUrl, false, method);
				}
				console.error(errorMessage + "\n\
					jsFileName:" + jsFileName + ':' + lineNo + "\n\
					phpUrl:" + phpUrl + "\n\
					method:" + method
				);
			}
			orm.error = errorMessage + "\nJS: " + method + "\nSQL: " + orm.sql;
		});

		return returnVal;
	}

	/**
	 * Similar to .load(), union adds more data from another table (dont confuse with join)
	 * @param {string} table Table name to union
	 * @param {string} where Where clause, including placeholders
	 * @param {string|array} params Data to replace ? placeholders
	 * @param {string|array} [columns=*] Optional columns to return for SELECT. Defaults to *
	 * @return {boolean} true/false depending on success
	 */
	union(table, pk, where, params, columns) {
		//if you need to, use .squash() after .union()
		this.table.push(table);
		this.pk.push(pk);
		return this.load(where, params, columns, null, null, null, this.pk.length - 1);
	}

	/**
	 * Squashes column data down to 1 row. Used after .union
	 * @param {string|array} ignore The columns to ignore
	 * @example [['RR012345_0011', 1, 0, 79.95],['RR012345_0011', 0, 1, 0]] will go to ['RR012345_0011', 1, 1, 79.95]
	 */
	squash(ignore) {
		const orm = this;
		const data = orm.data;
		const header = orm.header;

		//define order of precedence:
		//	undefined < null < 0 < "" < value
		const isValue = function(val) {
			if (typeof val === 'undefined') return 1;
			if (val === null) return 2;
			if (val === 0) return 3;
			if (val === "") return 4;
			return 5;
		}

		if (typeof ignore === 'string') {
			//convert string to array
			if (ignore.includes(',')) {
				ignore = ignore.split(',');
			} else {
				ignore = [ignore];
			}
		}

		let colIndex = 0;
		for (let head of header) {
			if (typeof ignore === 'undefined' || !ignore.includes(head)) {
				let currentRow = orm.get(head);
				if (currentRow !== null) {
					let zero = currentRow[0];

					for (let rowIndex = 0; rowIndex < currentRow.length; rowIndex++) {
						let currentItem = currentRow[rowIndex];

						if (currentItem != zero && isValue(currentItem) > isValue(zero)) {
							orm.set(header[colIndex], currentItem);
						}
					}
				}
			}

			colIndex++;
		}

		data.splice(1); //deletes other rows
		return true;
	}

	/**
	 * Returns an array containing a column of data
	 * @example
		const bar = foo.get('bar');
		if (bar == 1) { //true
		$('#bar').val(bar);
	 * @example
		//To loop, use:
		const status = warranty_status.get('status');
		for (let index in status) {
			console.log(status[index]);
		}
		//or
		status.forEach((element) => { //single column
			console.log(element);
		});
	 * @param {string} [colName] The name of the column to return, if empty returns all of the data
	 * @return {array|mixed} An array containing the column data, or if 1 element returns that element. If no data, return empty array which is equal to ''
	 */
	get(colName) {
		const orm = this;
		const data = orm.data;
		const returnVal = [];
		const rowName = parseInt(colName);

		if (!isNaN(rowName)) {
			//get row
			returnVal = data[rowName];
		} else {
			//return all of the data (2D array)
			if (typeof colName === 'undefined' || colName == null) {
				return orm.data;
			}

			//get column (1D array)
			if (typeof data[0] !== 'undefined' && typeof data[0][colName] === 'undefined') {
				let errorMessage = 'Column "' + colName + '" does not exist in data. Did you mean ';
				if (orm.header.length == 1) {
					console.error(errorMessage + '"' + orm.header[0] + '"?');
				} else {
					//try to find the column name
					const cols = Object.keys(data[0]).toString().split(',');
					let numCols = 0;

					cols.forEach(element => {
						if (colName.toLowerCase() == element.toLowerCase()) {
							errorMessage += '"' + element + '"? Yes, its case sensitive :-)';
							numCols++;
						}
					});

					if (numCols == 0) {
						errorMessage += 'one of these: ' + Object.keys(data[0]);
					}

					console.error("You tried " + orm.table + ".get('" + colName + "')");
					console.error(errorMessage);
				}
			}

			for (let rowIndex in data) {
				returnVal.push(data[rowIndex][colName]);
			}
		}

		//if 1 element, return that element
		if (typeof returnVal !== 'undefined' && returnVal.length == 1) {
			returnVal = returnVal[0];
		}

		return returnVal;
	}

	/**
	 * Sets a value in the 2D array
	 * You can also use special values like: now(), curdate(), curtime(), clientip(), serverip()
	 * @example inline.set('updated', 1);
	 * @example logfile.set('current_datetime', 'now()');
	 * @example paymentlines.set('terminal_ip', 'clientip()');
	 * @param {string} colName Column label
	 * @param {mixed} value The value to set
	 * @param {integer} [rowIndex=0] Row number, defaults to 0 if not specified
	 * @return {boolean}
	 */
	set(colName, value, rowIndex, table) {
		const orm = this;

		if (
			colName.includes("'") ||
			colName.includes('"') ||
			colName.includes(',')
		) {
			console.log('Column name:', colName);
			console.error('Check the column name! Its probably wrong!');
		}

		//if rowIndex is not specified, default to 0
		if (typeof rowIndex === 'undefined' || rowIndex === null || rowIndex === '') {
			rowIndex = 0;
		}

		//check colName
		if (typeof colName === 'undefined' || colName === null || colName === '') {
			console.error('Trying to set value ' + value + ' in blank column for row ' + rowIndex);
			return false;
		}
		colName = colName.toString();

		if (typeof table === 'undefined' || table === null || table === '') {
			table = orm.table[0];
		}

		//value is allowed to be null

		const data = orm.data;
		const header = orm.header;
		const widths = orm.widths;

		if (typeof data[rowIndex] === 'undefined') {
			//this will happen if orm.data is empty
			data[rowIndex] = [];
		}

		//add column to header
		if (!header.includes(colName)) {
			header.push(colName);
			widths.push(colName.length);
		}

		//update width
		if (value == null) {
			if (widths[rowIndex] < 4) {
				widths[rowIndex] = 4;
			}
		} else {
			if (widths[rowIndex] < value.length) {
				widths[rowIndex] = value.length;
			}
		}

		if (typeof data[rowIndex][colName] !== 'undefined' &&
			data[rowIndex][colName] !== '' &&
			data[rowIndex][colName] !== value
		) {
			console.log('data[' + rowIndex + '][' + colName + '] was "' + data[rowIndex][colName] + '", now "' + value + '"');
		}

		data[rowIndex][colName] = value;

		return true;
	}

	/**
	 * Saves data to database (update or insert query)
	 * For update, use .load() first then .set() then .save()
	 * For insert, use .set() first then .save()
	 * @example
	 	const branchxfer_full = new ORM('branchxfer_full', 'id', 'storecc');
		branchxfer_full.load('transref', stno, 'receiptedDateTime');
		branchxfer_full.set('receiptedDateTime', 'now()');
		branchxfer_full.save(); //will update existing, based on pk
	 * @return {boolean}
	 */
	save() {
		const orm = this;

		if (orm.isEmpty()) {
			console.warn('No data to save');
			return false;
		}

		const data = orm.data;
		const header = orm.header;
		let returnVal = false;
		let sql = '';

		for (let index = 0; index < orm.table.length; index++) {
			const table = orm.table[index];

			if (table != null && table != '') {
				for (let rowIndex in data) {
					const params = [];
					if (typeof data[rowIndex][orm.pk[index]] === 'undefined' || data[rowIndex][orm.pk[index]] == null) {
						//no data for pk, so insert
						sql = 'INSERT INTO ' + table + ' (';

						for (let colIndex in header) {
							sql += header[colIndex] + ', ';
						}

						sql = removeTrailingComma(sql);
						sql += ') VALUES (';

						for (let rowIndex in data) {
							for (let colIndex in header) {
								let colData = data[rowIndex][header[colIndex]];
								//override literal values
								if (
									colData == 'NULL' || colData == 'null' ||
									colData == 'NOW()' || colData == 'now()' ||
									colData == 'CURDATE()' || colData == 'curdate()' ||
									colData == 'CURTIME()' || colData == 'curtime()' ||
									colData == 'SYSDATE()' || colData == 'sysdate()' ||
									colData == 'CLIENTIP()' || colData == 'clientip()' ||
									colData == 'SERVERIP()' || colData == 'serverip()' ||
									colData == 'UNIX_TIMESTAMP()' || colData == 'unix_timestamp()'
								) {
									sql += colData + ', ';
								} else {
									sql += '?, ';
									params.push(colData);
								}
							}

							sql = removeTrailingComma(sql);
						}

						sql += ')';
					} else {
						//there is a value for pk, so update
						sql = 'UPDATE ' + table + ' SET ';

						for (let colIndex in header) {
							if (header[colIndex] !== orm.pk[index] && data[rowIndex][header[colIndex]] != null) {
								if (typeof data[rowIndex][header[colIndex]] === 'string' && (
									(data[rowIndex][header[colIndex]]).toLowerCase() == 'now()' ||
									(data[rowIndex][header[colIndex]]).toLowerCase() == 'curdate()' ||
									(data[rowIndex][header[colIndex]]).toLowerCase() == 'curtime()'
								)) {
									sql += header[colIndex] + ' = ' + data[rowIndex][header[colIndex]] + ', ';
								} else {
									sql += header[colIndex] + ' = ?, ';
									let colData = data[rowIndex][header[colIndex]];
									params.push(colData);
								}
							}
						}

						sql = removeTrailingComma(sql);
						sql += ' WHERE ' + orm.pk[index] + ' = ?';

						if (sql.includes(' SET  WHERE ')) {
							console.error('Please check this SQL for errors:' + "\n" + sql + "\n" + orm.info);
							return false;
						}

						params.push(data[rowIndex][orm.pk[index]]);
					}

					orm.sql = orm.niceSQL(sql, params);
					if (orm.sql.includes(' JOIN ')) {
						console.warn('Please check this SQL for errors:' + "\n" + orm.sql);
					} else {
						console.log(orm.info + ' is sending this to orm.php: ' + orm.sql);
					}

					//run sql
					$.ajax({
						method: "POST",
						url: 'php/orm.php',
						dataType: 'json',
						data: {
							sql: sql, //string
							params: params, //array
						}
					})
					.done(function (json) {
						console.log(json);

						if (json.success == 'Y') {
							orm.log = 'Table ' + table + ' ' + orm.sql.split(' ')[0].toLowerCase() + 'd successfully';
							returnVal = true;
							/*
							if (typeof json.lastInsertId !== 'undefined') {
								data[rowIndex][orm.pk[index]] = json.lastInsertId;
							}
							*/
						} else {
							returnVal = false;
							const errorCode = 'ORM03',
								errorMessage = 'Error ' + errorCode + ' (save)' + "\n" +
									json.error + "\n" +
									'sql:' + sql + "\n" +
									'params:' + params + "\n" +
									'info:' + orm.info,
								jsFileName = 'Scripts/orm.js',
								lineNo = 892,
								phpUrl = 'php/orm.php';
							if (orm.debug) {
								alert(json.error + "\n" +
									errorMessage + "\n\
									jsFileName:" + jsFileName + ':' + lineNo + "\n\
									phpUrl:" + phpUrl
								);
							} else {
								console.error(json.error);
								console.error(errorMessage + "\n\
									jsFileName:" + jsFileName + ':' + lineNo + "\n\
									phpUrl:" + phpUrl
								);
								console.log(errorCode, errorMessage, jsFileName, lineNo, phpUrl, false, sql);
								orm.error = errorMessage + "\nSQL: " + orm.sql;
							}
						}
					})
					.fail(function (jqXHR, textStatus, errorThrown) {
						const errorCode = 'ORM04',
							errorMessage = 'Error ' + errorCode + ' (save)' + "\n" +
								textStatus + "\n" +
								jqXHR.responseText + "\n" +
								errorThrown + "\n" +
								'sql:' + sql + "\n" +
								'params:' + params + "\n" +
								'nicesql: ' + orm.niceSQL(sql, params) + "\n" +
								'info:' + orm.info,
							jsFileName = 'Scripts/orm.js',
							lineNo = 922,
							phpUrl = 'php/orm.php';
						orm.error = errorMessage + "\nSQL: " + orm.sql;
						if (orm.debug) {
							document.getElementsByTagName("body")[0].innerHTML = errorMessage;
						} else {
							console.log(
								'code:' + errorCode,
								'error:' + errorMessage,
								'filename:' + jsFileName,
								'line:' + lineNo,
								'url:' + phpUrl,
								'sql:' + sql
							);
						}
						console.error(errorMessage + "\n\
							jsFileName:" + jsFileName + ':' + lineNo + "\n\
							phpUrl:" + phpUrl
						);
					});
				}
			} else {
				console.error('Table is empty');
			}

			if (orm.debug) {
				console.log(this);
			}
		}

		return returnVal;
	}

	/**
	 * Deletes rows in a table
	 * @param {string} where Where clause, including placeholders
	 * @param {array|string} [params] Data to replace ? placeholders
	 */
	delete(where, params) {
		const orm = this;
		const table = orm.table[0];
		let returnVal = false;

		//table validation
		if (table == null || table == '') {
			console.error('Trying to delete data from an unknown table');
			return false;
		}

		{ //this is just for debugging
			const method = orm.info + '.delete(';
			//where
			if (typeof where === 'string') {
				method += "'" + where + "'";
			} else if (Array.isArray(where) && where.length > 0) {
				method += '[' + where.toString() + ']';
			} else {
				//null or undefined
				method += 'null';
			}

			//params
			if (typeof params === 'string') {
				method += ", '" + params + "'";
			} else if (Array.isArray(params) && params.length > 0) {
				method += ', [';
				for (let i = 0; i < params.length; i++) {
					method += '"' + params[i] + '", ';
				}
				method = method.slice(0, -2);
				method += ']';
			} else {
				//null or undefined
				method += ', null';
			}

			method += ');';
		}

		//auto complete where statement
		if (typeof where !== 'undefined' &&
			where != '' &&
			where != null &&
			!where.includes('=') &&
			!where.includes('?')
		) {
			where += ' = ?';
		}

		//convert params to array
		if (typeof params === 'string' || typeof params === 'number') {
			const params_new = [];
			params_new.push(params);
			params = params_new;
			params_new = null;
		}

		//allow 'WHERE x = null' => 'WHERE x IS NULL'
		if (
			(
				params == null ||
				params == 'null' ||
				(
					typeof params == 'object' &&
					params.length == 0
				) || (
					typeof params == 'object' &&
					params.length == 1 &&
					params[0] === ''
				)
			) &&
			typeof where !== 'undefined' &&
			where !== null &&
			where !== ''
		) {
			where = where.replace(' = ?', ' IS NULL');
		}

		//delete from
		let sql = 'DELETE FROM ' + table;

		//where
		if (typeof where !== 'undefined' && where != '' && where != null) {
			sql += ' WHERE ' + where;
		}

		orm.sql = orm.niceSQL(sql, params);

		$.ajax({
			method: 'POST',
			url: 'php/orm.php',
			dataType: 'json',
			data: {
				sql: sql, //string
				params: params, //array
			}
		})
		.done(function (json) {
			console.log(json);

			if (json.success == 'Y') {
				returnVal = true;
			} else {
				console.error(json.error);
				const errorCode = 'ORM05',
					errorMessage = 'Error ' + errorCode + ' ' + method + "\n" +
						json.error + "\n" +
						sql + "\n" +
						orm.info,
					jsFileName = 'Scripts/orm.js',
					lineNo = 1072,
					phpUrl = 'php/orm.php';
				if (orm.debug) {
					alert(errorMessage + "\njsFileName:" + jsFileName + ':' + lineNo + "\nphpUrl:" + phpUrl);
				} else {
					console.log(errorCode, errorMessage, jsFileName, lineNo, phpUrl, false, sql);
				}
				console.error(errorMessage + "\njsFileName:" + jsFileName + ':' + lineNo + "\nphpUrl:" + phpUrl);
			}
		})
		.fail(function (jqXHR, textStatus, errorThrown) {
			const errorCode = 'ORM06',
				jsFileName = 'Scripts/orm.js',
				lineNo = 1085,
				phpUrl = 'php/orm.php';
			const errorMessage = 'Error ' + errorCode + "\n\
				Status: " + textStatus + "\n\
				Response: " + jqXHR.responseText + "\n\
				ErrorThrown: " + errorThrown + "\n\
				SQL: " + orm.sql + "\n\
				Info: " + orm.info;
			if (orm.debug) {
				alert(errorMessage + "\njsFileName:" + jsFileName + ':' + lineNo + "\nphpUrl:" + phpUrl);
			} else {
				console.log(errorCode, errorMessage, jsFileName, lineNo, phpUrl, false, method);
			}
			console.error(errorMessage + "\n\
				jsFileName:" + jsFileName + ':' + lineNo + "\n\
				phpUrl:" + phpUrl + "\n\
				method:" + method
			);

			orm.error = errorMessage + "\nJS: " + method + "\nSQL: " + orm.sql;
		});

		//allow viewing of sql about to run, and also output from ajax
		if (orm.debug) {
			console.log(this);
		}

		return returnVal;
	}

	/**
	 * Runs raw SQL
	 * @param {string} sql SQL string, including placeholders (?)
	 * @param {string|array} [params] Replace ? with these parameters in the SQL string
	 * @param {boolean} async Whether the request is synchronous or asynchronous
	 * @return {boolean}
	 */
	rawSQL(sql, params, async) {
		const orm = this;
		const header = orm.header;
		const widths = orm.widths;
		let returnVal = false;

		//convert string to array
		if (typeof params === 'string') {
			params = [params];
		}

		//default values for async
		if (typeof async === 'undefined' || async == null) {
			//select is synchronous, all others are asynchronous
			if (sql.substring(0, 6).toLowerCase() == 'select') {
				async = false;
			} else {
				async = true;
			}
		}

		//console.log(orm.niceSQL(sql, params));

		//run sql
		$.ajax({
			method: "POST",
			url: 'php/orm.php',
			async: async,
			dataType: 'json',
			data: {
				sql: sql, //string
				params: params, //array
			}
		})
		.done(function (json) {
			//console.log('rawSQL: Response from orm:');
			//console.log(json);

			if (json.success == 'Y') {
				orm.error = 'Raw SQL ran successfully';

				if (typeof json.data !== 'undefined' && json.data !== '') {
					//console.log(json.data);

					json.data.forEach((element) => {
						orm.data.push(element);
					});

					//update header
					for (let rowIndex in orm.data) {
						let rowData = orm.data[rowIndex];
						let colNumber = 0;

						for (let colIndex in rowData) {
							if (!header.includes(colIndex)) {
								//column not found, add it
								header.push(colIndex);
								widths.push(colIndex.length);
							} else {
								//found column name, update width
								if (rowData[colIndex] == null) {
									if (widths[colNumber] < 4) {
										widths[colNumber] = 4;
									}
								} else {
									if (widths[colNumber] < rowData[colIndex].length) {
										widths[colNumber] = rowData[colIndex].length;
									}
								}
							}

							colNumber++;
						}
					}
				}

				returnVal = true;
			} else {
				const errorCode = 'ORM07',
					errorMessage = 'Error ' + errorCode + ' (rawSQL)' + "\n" +
						orm.niceSQL(sql, params) + "\n" +
						json.error + "\n" +
						'sql:' + sql + "\n" +
						'params:' + params + "\n" +
						'info:' + orm.info,
					jsFileName = 'Scripts/orm.js',
					lineNo = 1208,
					phpUrl = 'php/orm.php';
				if (orm.debug) {
					alert(json.error + "\n" +
						errorMessage + "\n\
						jsFileName:" + jsFileName + ':' + lineNo + "\n\
						phpUrl:" + phpUrl
					);
				} else {
					console.error(json.error);
					console.error(errorMessage + "\n\
						jsFileName:" + jsFileName + ':' + lineNo + "\n\
						phpUrl:" + phpUrl
					);
					console.log(errorCode, errorMessage, jsFileName, lineNo, phpUrl, false, sql);
					orm.error = errorMessage + "\nSQL: " + orm.sql;
				}
			}
		})
		.fail(function (jqXHR, textStatus, errorThrown) {
			const errorCode = 'ORM08',
				errorMessage = 'Error ' + errorCode + ' (rawSQL)' + "\n" +
					textStatus + "\n" +
					jqXHR.responseText + "\n" +
					errorThrown + "\n" +
					'sql:' + sql + "\n" +
					'params:' + params + "\n" +
					'info:' + orm.info,
				jsFileName = 'Scripts/orm.js',
				lineNo = 1237,
				phpUrl = 'php/orm.php';
			orm.error = errorMessage + "\nSQL: " + orm.sql;
			if (orm.debug) {
				alert(errorMessage + "\njsFileName:" + jsFileName + ':' + lineNo + "\nphpUrl:" + phpUrl);
			} else {
				if (sql !== 'select clientip() as ipaddress') {
					console.log(errorCode, errorMessage, jsFileName, lineNo, phpUrl, false, sql);
				}
			}
			console.error(errorMessage + "\n\
				jsFileName:" + jsFileName + ':' + lineNo + "\n\
				phpUrl:" + phpUrl
			);
		});

		return returnVal;
	}

	/**
	 * Counts occurrences of a substring in a string
	 * @param {String} string The string
	 * @param {String} subString The sub string to search for
	 * @param {Boolean} [allowOverlapping] Optional. (Default:false)
	 * @return {Integer} Number of occurrences
	 *
	 * @author Vitim.us https://gist.github.com/victornpb/7736865
	 * @see Unit Test https://jsfiddle.net/Victornpb/5axuh96u/
	 * @see http://stackoverflow.com/questions/4009756/how-to-count-string-occurrence-in-string/7924240#7924240
	 */
	occurrences(string, subString, allowOverlapping) {
		string += "";
		subString += "";
		if (subString.length <= 0) return (string.length + 1);

		let n = 0,
			pos = 0,
			step = allowOverlapping ? 1 : subString.length;

		for (; ;) {
			pos = string.indexOf(subString, pos);
			if (pos >= 0) {
				++n;
				pos += step;
			} else break;
		}
		return n;
	}

	/**
	 * Pretty print SQL
	 * Dont use this for printing errors, because the number of placeholders could be different in the SQL
	 * @param {string} sql String containing SQL, including placeholders
	 * @param {array} [params] Replace placeholders with the items from this array
	 * @return {string} The pretty SQL
	 */
	niceSQL(sql, params) {
		const niceSQL = sql;

		if (typeof params !== 'undefined' && params != null && params.length > 0) {
			if (this.occurrences(sql, '?') != params.length) {
				console.warn('There is an imbalance of params!' + "\n" + 'SQL: ' + sql + "\n" +
					'Params: ' + params.toString());
			}

			params.forEach((element) => {
				let pos = niceSQL.indexOf('?'); //gets position of first placeholder
				if (typeof element === 'string' && typeof element !== 'number') {
					//put quotes around string values
					niceSQL = niceSQL.substring(0, pos) + "'" + element + "'" + niceSQL.substring(pos + 1);
				} else {
					niceSQL = niceSQL.substring(0, pos) + element + niceSQL.substring(pos + 1);
				}
			});
		}

		return niceSQL;
	}

	/**
	 * Counts number of rows in data
	 * @return {integer} The number of rows in data
	 */
	numRows() {
		const data = this.data;
		let numRows = 0;
		let tempVal = 0; //just to stop errors

		//cant use data.length due to null values, so have to do it this way
		for (let rowIndex in data) {
			tempVal = rowIndex;
			numRows++;
		}

		tempVal;
		return numRows;
	}

	/**
	 * Checks to see if the data is empty or not
	 * Dont confuse with orm._empty(val)
	 * @return {boolean}
	 */
	isEmpty() {
		if (this.numRows() == 0) {
			return true;
		}

		return false;
	}

	/**
	 * Shows the last error message
	 * @return {string} The last error message
	 */
	getError() {
		return this.error;
	}

	/**
	 * Shows the last SQL query that was run (in nice format, no placeholders)
	 * Use this for testing SQL queries
	 * @return {string} The SQL query
	 */
	getSQL() {
		return this.sql;
	}

	/**
	 * Removes trailing commas from a string
	 * @param sql {string} Some string to check
	 * @return {string} The string with the trailing comma removed
	 */
	removeTrailingComma(sql) {
		if (sql.slice(-2) == ', ') {
			sql = sql.slice(0, -2); //remove last 2 chars
		}
		return sql;
	}

	/**
	 * Helper function for checking if a value is empty
	 * Same as PHP's empty() function
	 * Dont confuse with .isEmpty()
	 * @param {mixed} val The value to check for emptiness
	 * @return {boolean}
	 */
	_empty(val) {
		if (
			typeof val === 'undefined' ||
			val == '' ||
			val == 0 ||
			val == '0' ||
			val == null ||
			!val ||
			val == []
		) {
			return true;
		}
		return false;
	}

	/**
	 * Adds padding onto the end of a string. This is used by .toString()
	 * @param {string} data The string to pad
	 * @param {integer} width The width of the resulting string
	 * @return {string} The padded string
	 */
	_padEnd(data, width) {
		if (typeof data === 'number') {
			data = data.toString();
		}

		let returnVal = data;

		if (data.length < width) {
			for (let i = data.length; i < width; i++) {
				returnVal += ' ';
			}
		}

		return returnVal;
	}

	/**
	 * Converts from JS object to string
	 * @return {string} A string representing the object
	 */
	toString() {
		const orm = this;
		const data = orm.data;
		const header = orm.header;
		const widths = orm.widths;
		const tables = orm.table.toString();
		const pks = orm.pk.toString();
		const sql = orm.sql;

		let returnVal = 'tables: ' + tables + "\n"; //db table name
		returnVal += 'pks: ' + pks + "\n"; //primary key column name
		returnVal += 'sql: ' + sql + "\n";
		returnVal += 'data:' + "\n";

		//table header
		returnVal += ' # ';
		for (let colIndex in header) {
			returnVal += orm._padEnd(header[colIndex], widths[colIndex]) + ' ';
		}
		returnVal += '\n';

		//table body
		for (let rowIndex in data) {
			returnVal += ' ' + rowIndex + ' ';
			let colNumber = 0;

			for (let colIndex in header) {
				let colData = data[rowIndex][header[colIndex]];

				if (typeof colData === 'undefined' || colData == null) {
					colData = '<null>';
				}

				returnVal += orm._padEnd(colData, widths[colNumber]) + ' ';
				colNumber++;
			}

			returnVal += '\n';
		}

		return returnVal;
	}
}
